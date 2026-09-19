const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { authenticateUser, requireRole } = require('../middleware/auth.middleware');

/**
 * Generate a unique human-friendly Ticket Number (e.g. TKT-7482)
 */
async function generateUniqueTicketNumber() {
  let isUnique = false;
  let ticketNumber = '';
  let attempts = 0;

  while (!isUnique && attempts < 10) {
    attempts++;
    const randomDigits = Math.floor(1000 + Math.random() * 9000);
    ticketNumber = `TKT-${randomDigits}`;

    const { data, error } = await supabase
      .from('support_tickets')
      .select('id')
      .eq('ticket_number', ticketNumber)
      .maybeSingle();

    if (!error && !data) {
      isUnique = true;
    }
  }

  return ticketNumber || `TKT-${Date.now().toString().slice(-4)}`;
}

/**
 * GET /api/support/unread-count
 * Quick count of unread messages and active tickets
 */
router.get('/unread-count', authenticateUser, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role || 'customer';

    let openTicketsCount = 0;
    let unreadMessagesCount = 0;

    if (userRole === 'admin') {
      const { count: openCount } = await supabase
        .from('support_tickets')
        .select('id', { count: 'exact', head: true })
        .in('status', ['open', 'in_progress']);

      openTicketsCount = openCount || 0;

      // Count unread messages not sent by admin
      const { count: unreadCount } = await supabase
        .from('support_messages')
        .select('id', { count: 'exact', head: true })
        .eq('is_read', false)
        .neq('sender_id', userId);

      unreadMessagesCount = unreadCount || 0;
    } else if (userRole === 'partner') {
      const { data: dairy } = await supabase
        .from('dairies')
        .select('id')
        .eq('owner_id', userId)
        .maybeSingle();

      const dairyId = dairy ? dairy.id : null;

      let ticketQuery = supabase
        .from('support_tickets')
        .select('id', { count: 'exact', head: true })
        .in('status', ['open', 'in_progress']);

      if (dairyId) {
        ticketQuery = ticketQuery.or(`user_id.eq.${userId},dairy_id.eq.${dairyId}`);
      } else {
        ticketQuery = ticketQuery.eq('user_id', userId);
      }

      const { count: openCount } = await ticketQuery;
      openTicketsCount = openCount || 0;

      // Unread messages on tickets the partner is part of
      const { data: partnerTickets } = await supabase
        .from('support_tickets')
        .select('id')
        .or(dairyId ? `user_id.eq.${userId},dairy_id.eq.${dairyId}` : `user_id.eq.${userId}`);

      const ticketIds = (partnerTickets || []).map((t) => t.id);
      if (ticketIds.length > 0) {
        const { count: unreadCount } = await supabase
          .from('support_messages')
          .select('id', { count: 'exact', head: true })
          .in('ticket_id', ticketIds)
          .eq('is_read', false)
          .neq('sender_id', userId);

        unreadMessagesCount = unreadCount || 0;
      }
    } else {
      // Customer
      const { count: openCount } = await supabase
        .from('support_tickets')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .in('status', ['open', 'in_progress']);

      openTicketsCount = openCount || 0;

      const { data: customerTickets } = await supabase
        .from('support_tickets')
        .select('id')
        .eq('user_id', userId);

      const ticketIds = (customerTickets || []).map((t) => t.id);
      if (ticketIds.length > 0) {
        const { count: unreadCount } = await supabase
          .from('support_messages')
          .select('id', { count: 'exact', head: true })
          .in('ticket_id', ticketIds)
          .eq('is_read', false)
          .neq('sender_id', userId);

        unreadMessagesCount = unreadCount || 0;
      }
    }

    res.json({
      success: true,
      open_tickets_count: openTicketsCount,
      unread_messages_count: unreadMessagesCount,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/support/contacts
 * Contact directory for direct messaging (Admins can contact any partner/customer)
 */
router.get('/contacts', authenticateUser, async (req, res, next) => {
  try {
    const userRole = req.user.role || 'customer';

    if (userRole === 'admin') {
      const [{ data: partners }, { data: customers }, { data: dairies }] = await Promise.all([
        supabase.from('partner_profiles').select('id, full_name, email, phone, avatar_url, business_name'),
        supabase.from('customer_profiles').select('id, full_name, email, phone, avatar_url, city, address'),
        supabase.from('dairies').select('id, owner_id, dairy_name, phone, is_approved, is_active'),
      ]);

      const dairyMap = {};
      (dairies || []).forEach((d) => {
        if (d.owner_id) dairyMap[d.owner_id] = d;
      });

      const partnerContacts = (partners || []).map((p) => ({
        id: p.id,
        role: 'partner',
        full_name: p.full_name,
        email: p.email,
        phone: p.phone,
        avatar_url: p.avatar_url,
        business_name: p.business_name || dairyMap[p.id]?.dairy_name || 'Dairy Business',
        dairy_id: dairyMap[p.id]?.id || null,
        dairy_name: dairyMap[p.id]?.dairy_name || null,
        is_approved: dairyMap[p.id]?.is_approved ?? false,
      }));

      const customerContacts = (customers || []).map((c) => ({
        id: c.id,
        role: 'customer',
        full_name: c.full_name,
        email: c.email,
        phone: c.phone,
        avatar_url: c.avatar_url,
        city: c.city || 'India',
        address: c.address || '',
      }));

      return res.json({
        success: true,
        partners: partnerContacts,
        customers: customerContacts,
      });
    }

    if (userRole === 'partner') {
      // Return Admin contacts + Partner's subscribed customers
      const { data: dairy } = await supabase
        .from('dairies')
        .select('id')
        .eq('owner_id', req.user.id)
        .maybeSingle();

      let subscribers = [];
      if (dairy) {
        const { data: subs } = await supabase
          .from('subscriptions')
          .select('customer:customer_profiles(id, full_name, email, phone, avatar_url)')
          .eq('dairy_id', dairy.id);

        subscribers = (subs || []).map((s) => s.customer).filter(Boolean);
      }

      return res.json({
        success: true,
        admin: {
          role: 'admin',
          full_name: 'Near Dairy Platform Support',
          email: 'support@neardairy.com',
          phone: '+91 80000 12345',
        },
        subscribers,
      });
    }

    // Customer contacts: Subscribed Dairies + Admin Support
    const { data: subs } = await supabase
      .from('subscriptions')
      .select('dairy:dairies(id, dairy_name, phone, email, banner_image)')
      .eq('customer_id', req.user.id);

    const uniqueDairies = {};
    (subs || []).forEach((s) => {
      if (s.dairy && s.dairy.id) uniqueDairies[s.dairy.id] = s.dairy;
    });

    res.json({
      success: true,
      admin: {
        role: 'admin',
        full_name: 'Near Dairy Platform Support',
        email: 'support@neardairy.com',
        phone: '+91 80000 12345',
      },
      dairies: Object.values(uniqueDairies),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/support/tickets
 * Fetch support tickets with role filtering & search
 */
router.get('/tickets', authenticateUser, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role || 'customer';
    const { role, status, priority, search, limit = 100 } = req.query;

    let query = supabase
      .from('support_tickets')
      .select(`
        *,
        dairy:dairies(id, dairy_name, phone, address, banner_image),
        order:orders(id, order_type, total_amount, delivery_status, delivery_date)
      `)
      .order('updated_at', { ascending: false })
      .limit(parseInt(limit) || 100);

    // Role-based scoping
    if (userRole === 'admin') {
      if (role && role !== 'all') {
        query = query.eq('user_role', role);
      }
    } else if (userRole === 'partner') {
      const { data: dairy } = await supabase
        .from('dairies')
        .select('id')
        .eq('owner_id', userId)
        .maybeSingle();

      const dairyId = dairy ? dairy.id : null;
      if (dairyId) {
        query = query.or(`user_id.eq.${userId},dairy_id.eq.${dairyId}`);
      } else {
        query = query.eq('user_id', userId);
      }
    } else {
      // Customer can only view tickets raised by themselves
      query = query.eq('user_id', userId);
    }

    // Status filter
    if (status && status !== 'all') {
      if (status === 'active') {
        query = query.in('status', ['open', 'in_progress']);
      } else {
        query = query.eq('status', status);
      }
    }

    // Priority filter
    if (priority && priority !== 'all') {
      query = query.eq('priority', priority);
    }

    const { data: tickets, error } = await query;
    if (error) throw error;

    if (!tickets || tickets.length === 0) {
      return res.json({ success: true, tickets: [] });
    }

    const ticketIds = tickets.map((t) => t.id);
    const userIds = [...new Set(tickets.map((t) => t.user_id).filter(Boolean))];

    // Fetch user profile info from unified profiles view
    let profilesMap = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email, phone, role, avatar_url, city, address')
        .in('id', userIds);

      (profiles || []).forEach((p) => {
        profilesMap[p.id] = p;
      });
    }

    // Fetch latest messages & unread message counts for all tickets
    const { data: allMessages } = await supabase
      .from('support_messages')
      .select('id, ticket_id, sender_id, sender_name, sender_role, message, attachment_url, is_read, created_at')
      .in('ticket_id', ticketIds)
      .order('created_at', { ascending: true });

    const messagesByTicket = {};
    (allMessages || []).forEach((msg) => {
      if (!messagesByTicket[msg.ticket_id]) {
        messagesByTicket[msg.ticket_id] = [];
      }
      messagesByTicket[msg.ticket_id].push(msg);
    });

    const enrichedTickets = tickets.map((t) => {
      const ticketMessages = messagesByTicket[t.id] || [];
      const latestMsg = ticketMessages.length > 0 ? ticketMessages[ticketMessages.length - 1] : null;
      const unreadCount = ticketMessages.filter(
        (m) => m.sender_id !== userId && !m.is_read
      ).length;

      const profile = profilesMap[t.user_id] || null;

      return {
        ...t,
        user_profile: profile,
        user_name: t.user_name || profile?.full_name || 'Platform User',
        user_email: profile?.email || null,
        user_phone: profile?.phone || null,
        user_avatar: profile?.avatar_url || null,
        latest_message: latestMsg,
        unread_count: unreadCount,
        total_messages: ticketMessages.length,
      };
    });

    // Optional text search filter
    let filteredTickets = enrichedTickets;
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      filteredTickets = enrichedTickets.filter((t) => {
        return (
          t.ticket_number?.toLowerCase().includes(q) ||
          t.subject?.toLowerCase().includes(q) ||
          t.user_name?.toLowerCase().includes(q) ||
          t.dairy?.dairy_name?.toLowerCase().includes(q) ||
          t.category?.toLowerCase().includes(q) ||
          t.latest_message?.message?.toLowerCase().includes(q)
        );
      });
    }

    res.json({
      success: true,
      tickets: filteredTickets,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/support/tickets
 * Create a new support ticket / inquiry thread
 */
router.post('/tickets', authenticateUser, async (req, res, next) => {
  try {
    const {
      subject,
      category = 'general',
      priority = 'medium',
      message,
      dairy_id,
      order_id,
      target_user_id,
      target_user_role,
      target_user_name,
      attachment_url,
    } = req.body;

    if (!subject || !subject.trim()) {
      return res.status(400).json({ success: false, message: 'Subject is required.' });
    }
    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, message: 'Initial message description is required.' });
    }

    const currentUserId = req.user.id;
    const currentUserRole = req.user.role || 'customer';
    const currentUserName = req.user.full_name || 'User';
    const currentUserAvatar = req.user.avatar_url || null;

    let ticketUserId = currentUserId;
    let ticketUserRole = currentUserRole;
    let ticketUserName = currentUserName;

    // Admin can initiate a direct ticket/chat to a specific partner or customer
    if (currentUserRole === 'admin' && target_user_id) {
      ticketUserId = target_user_id;
      ticketUserRole = target_user_role || 'partner';
      ticketUserName = target_user_name || 'User';
    }

    const ticket_number = await generateUniqueTicketNumber();

    const { data: ticket, error: ticketError } = await supabase
      .from('support_tickets')
      .insert({
        ticket_number,
        user_id: ticketUserId,
        user_role: ticketUserRole,
        user_name: ticketUserName,
        dairy_id: dairy_id || null,
        order_id: order_id || null,
        subject: subject.trim(),
        category,
        priority,
        status: 'open',
        updated_at: new Date().toISOString(),
      })
      .select(`
        *,
        dairy:dairies(id, dairy_name, phone)
      `)
      .single();

    if (ticketError) throw ticketError;

    // Insert first message
    const { data: firstMessage, error: msgError } = await supabase
      .from('support_messages')
      .insert({
        ticket_id: ticket.id,
        sender_id: currentUserId,
        sender_name: currentUserName,
        sender_role: currentUserRole,
        sender_avatar: currentUserAvatar,
        message: message.trim(),
        attachment_url: attachment_url || null,
        is_read: false,
      })
      .select()
      .single();

    if (msgError) throw msgError;

    // Send notifications to the appropriate parties
    try {
      if (currentUserRole === 'admin') {
        // Admin created ticket for a partner or customer
        await supabase.from('notifications').insert({
          recipient_id: ticketUserId,
          type: 'support_message',
          title: `💬 New Message from Admin: ${subject.trim()}`,
          message: message.slice(0, 120),
          data: { ticket_id: ticket.id, ticket_number: ticket.ticket_number },
        });
      } else {
        // Customer or Partner created ticket -> notify Admin & Dairy if relevant
        if (dairy_id && currentUserRole === 'customer') {
          const { data: dairy } = await supabase
            .from('dairies')
            .select('owner_id')
            .eq('id', dairy_id)
            .maybeSingle();

          if (dairy && dairy.owner_id) {
            await supabase.from('notifications').insert({
              recipient_id: dairy.owner_id,
              dairy_id,
              type: 'support_ticket',
              title: `⚠️ New Customer Ticket: ${subject.trim()}`,
              message: `${currentUserName}: ${message.slice(0, 100)}`,
              data: { ticket_id: ticket.id, ticket_number: ticket.ticket_number },
            });
          }
        }
      }
    } catch (notifErr) {
      console.error('Failed to dispatch support notification:', notifErr);
    }

    res.status(201).json({
      success: true,
      message: 'Support ticket created successfully.',
      ticket: {
        ...ticket,
        latest_message: firstMessage,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/support/tickets/:id
 * Retrieve a ticket and its entire live chat history
 */
router.get('/tickets/:id', authenticateUser, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role || 'customer';

    const { data: ticket, error: ticketError } = await supabase
      .from('support_tickets')
      .select(`
        *,
        dairy:dairies(id, dairy_name, phone, address, banner_image),
        order:orders(id, order_type, total_amount, delivery_status, delivery_date)
      `)
      .eq('id', id)
      .single();

    if (ticketError || !ticket) {
      return res.status(404).json({ success: false, message: 'Support ticket not found.' });
    }

    // Permission check
    if (userRole !== 'admin') {
      if (userRole === 'partner') {
        const { data: dairy } = await supabase
          .from('dairies')
          .select('id')
          .eq('owner_id', userId)
          .maybeSingle();

        const isOwner = ticket.user_id === userId;
        const isDairyMatch = dairy && ticket.dairy_id === dairy.id;

        if (!isOwner && !isDairyMatch) {
          return res.status(403).json({ success: false, message: 'Access denied to this ticket.' });
        }
      } else {
        // Customer
        if (ticket.user_id !== userId) {
          return res.status(403).json({ success: false, message: 'Access denied to this ticket.' });
        }
      }
    }

    // Fetch User Profile
    let userProfile = null;
    if (ticket.user_id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, full_name, email, phone, role, avatar_url, city, address')
        .eq('id', ticket.user_id)
        .maybeSingle();

      userProfile = profile;
    }

    // Fetch full messages history
    const { data: messages, error: msgError } = await supabase
      .from('support_messages')
      .select('*')
      .eq('ticket_id', id)
      .order('created_at', { ascending: true });

    if (msgError) throw msgError;

    // Mark unread messages sent by counterparty as read
    try {
      await supabase
        .from('support_messages')
        .update({ is_read: true })
        .eq('ticket_id', id)
        .neq('sender_id', userId)
        .eq('is_read', false);
    } catch (readErr) {
      console.warn('Could not mark messages as read:', readErr.message);
    }

    res.json({
      success: true,
      ticket: {
        ...ticket,
        user_profile: userProfile,
        user_name: ticket.user_name || userProfile?.full_name || 'Platform User',
        user_email: userProfile?.email || null,
        user_phone: userProfile?.phone || null,
        user_avatar: userProfile?.avatar_url || null,
      },
      messages: messages || [],
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/support/tickets/:id/messages
 * Send a new chat message in an ongoing ticket
 */
router.post('/tickets/:id/messages', authenticateUser, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { message, attachment_url } = req.body;

    if ((!message || !message.trim()) && !attachment_url) {
      return res.status(400).json({ success: false, message: 'Message text or attachment is required.' });
    }

    const userId = req.user.id;
    const userRole = req.user.role || 'customer';
    const userName = req.user.full_name || 'User';
    const userAvatar = req.user.avatar_url || null;

    // Verify ticket existence
    const { data: ticket, error: ticketError } = await supabase
      .from('support_tickets')
      .select('id, ticket_number, user_id, user_role, dairy_id, status, subject')
      .eq('id', id)
      .single();

    if (ticketError || !ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found.' });
    }

    // Insert new message
    const { data: newMessage, error: msgError } = await supabase
      .from('support_messages')
      .insert({
        ticket_id: id,
        sender_id: userId,
        sender_name: userName,
        sender_role: userRole,
        sender_avatar: userAvatar,
        message: (message && message.trim()) ? message.trim() : 'Sent an attachment',
        attachment_url: attachment_url || null,
        is_read: false,
      })
      .select()
      .single();

    if (msgError) throw msgError;

    // Auto-update ticket status:
    // If ticket was resolved/closed and customer or partner messages, reopen to in_progress
    // If ticket was open and admin messages, transition to in_progress
    let nextStatus = ticket.status;
    if (['resolved', 'closed'].includes(ticket.status) && userRole !== 'admin') {
      nextStatus = 'in_progress';
    } else if (ticket.status === 'open' && userRole === 'admin') {
      nextStatus = 'in_progress';
    }

    await supabase
      .from('support_tickets')
      .update({
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    // Notify the other party
    try {
      const recipientId = userRole === 'admin' ? ticket.user_id : null;
      if (recipientId && recipientId !== userId) {
        await supabase.from('notifications').insert({
          recipient_id: recipientId,
          type: 'support_message',
          title: `💬 Admin reply on #${ticket.ticket_number}`,
          message: (message || 'New attachment received').slice(0, 120),
          data: { ticket_id: id, ticket_number: ticket.ticket_number },
        });
      }
    } catch (notifErr) {
      console.error('Notification error on chat message:', notifErr);
    }

    res.status(201).json({
      success: true,
      message: 'Message sent successfully.',
      chat_message: newMessage,
      ticket_status: nextStatus,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/support/tickets/:id/status
 * Update ticket status, priority, or resolution notes (Admin or Partner)
 */
router.patch('/:id/status', authenticateUser, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, priority, resolution_notes, assigned_to } = req.body;
    const userRole = req.user.role || 'customer';
    const userName = req.user.full_name || 'Admin';

    if (userRole === 'customer') {
      return res.status(403).json({ success: false, message: 'Only Admins and Dairy Partners can update ticket status.' });
    }

    const updatePayload = {
      updated_at: new Date().toISOString(),
    };

    if (status) updatePayload.status = status;
    if (priority) updatePayload.priority = priority;
    if (resolution_notes !== undefined) updatePayload.resolution_notes = resolution_notes;
    if (assigned_to !== undefined) updatePayload.assigned_to = assigned_to;

    const { data: ticket, error: ticketError } = await supabase
      .from('support_tickets')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (ticketError) throw ticketError;

    // Post automated system activity message into the chat stream
    let systemLog = `Status changed to "${status || ticket.status}" by ${userName}.`;
    if (resolution_notes) {
      systemLog += ` Resolution note: "${resolution_notes}"`;
    }

    await supabase.from('support_messages').insert({
      ticket_id: id,
      sender_id: req.user.id,
      sender_name: 'Near Dairy System',
      sender_role: 'system',
      message: systemLog,
      is_read: true,
    });

    // Notify ticket owner
    if (ticket.user_id && ticket.user_id !== req.user.id) {
      try {
        await supabase.from('notifications').insert({
          recipient_id: ticket.user_id,
          type: 'support_status',
          title: `Ticket #${ticket.ticket_number} Updated (${ticket.status.toUpperCase()})`,
          message: resolution_notes || `Your support ticket status has been updated to ${ticket.status}.`,
          data: { ticket_id: id, ticket_number: ticket.ticket_number, status: ticket.status },
        });
      } catch (notifErr) {
        console.warn('Could not dispatch status change notification:', notifErr);
      }
    }

    res.json({
      success: true,
      message: 'Support ticket updated.',
      ticket,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
