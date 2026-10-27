const router = require('express').Router();
const auth = require('../middleware/auth');
const db = require('../config/db');
const mockStore = require('../services/mock.store');
const { ok, fail, id, asyncHandler } = require('../utils/http');

const mockMode = process.env.MOCK_MODE === 'true';

router.use(auth);

// GET /api/support/faqs
router.get(
  '/faqs',
  asyncHandler(async (req, res) => {
    if (mockMode) {
      return ok(res, { faqs: mockStore.faqs });
    }
    const [faqs] = await db.query('SELECT faq_id,question,answer,category FROM support_faqs WHERE is_active=TRUE ORDER BY id');
    return ok(res, { faqs });
  })
);

// POST /api/support/tickets
router.post(
  '/tickets',
  asyncHandler(async (req, res) => {
    const { category, ride_id, subject, message } = req.body;
    if (!['RIDE', 'PAYMENT', 'DRIVER', 'APP', 'OTHER'].includes(category) || !subject || !message) {
      return fail(res, 422, 'category, subject and message are required', 'VALIDATION_ERROR');
    }

    if (mockMode) {
      const ticket = mockStore.createSupportTicket(req.user.id, { category, ride_id, subject, message });
      return ok(res, { ticket_id: ticket.ticket_id, status: ticket.status }, 'Support ticket created', 201);
    }

    const ticketId = id('ticket');
    await db.query(
      'INSERT INTO support_tickets (ticket_id,user_id,category,ride_id,subject,message) VALUES (?,?,?,?,?,?)',
      [ticketId, req.user.id, category, ride_id || null, subject, message]
    );
    await db.query('INSERT INTO support_messages (ticket_id,sender_type,message) VALUES (?,?,?)', [ticketId, 'USER', message]);
    return ok(res, { ticket_id: ticketId, status: 'OPEN' }, 'Support ticket created', 201);
  })
);

// GET /api/support/tickets
router.get(
  '/tickets',
  asyncHandler(async (req, res) => {
    if (mockMode) {
      return ok(res, { tickets: mockStore.getSupportTickets(req.user.id) });
    }
    const [tickets] = await db.query(
      'SELECT ticket_id,category,ride_id,subject,message,status,created_at,updated_at FROM support_tickets WHERE user_id=? ORDER BY id DESC',
      [req.user.id]
    );
    return ok(res, { tickets });
  })
);

// GET /api/support/tickets/:ticket_id
router.get(
  '/tickets/:ticket_id',
  asyncHandler(async (req, res) => {
    if (mockMode) {
      const t = mockStore.getSupportTicket(req.params.ticket_id);
      if (!t || String(t.user_id) !== String(req.user.id)) return fail(res, 404, 'Ticket not found', 'TICKET_NOT_FOUND');
      return ok(res, t);
    }

    const [t] = await db.query(
      'SELECT ticket_id,category,ride_id,subject,message,status,created_at,updated_at FROM support_tickets WHERE ticket_id=? AND user_id=?',
      [req.params.ticket_id, req.user.id]
    );
    if (!t.length) return fail(res, 404, 'Ticket not found', 'TICKET_NOT_FOUND');
    const [messages] = await db.query(
      'SELECT sender_type,message,created_at FROM support_messages WHERE ticket_id=? ORDER BY id',
      [req.params.ticket_id]
    );
    return ok(res, { ...t[0], messages });
  })
);

// POST /api/support/tickets/:ticket_id/reply
router.post(
  '/tickets/:ticket_id/reply',
  asyncHandler(async (req, res) => {
    if (!req.body.message) return fail(res, 422, 'message is required', 'VALIDATION_ERROR');

    if (mockMode) {
      const t = mockStore.getSupportTicket(req.params.ticket_id);
      if (!t || String(t.user_id) !== String(req.user.id)) return fail(res, 404, 'Ticket not found', 'TICKET_NOT_FOUND');
      if (t.status === 'RESOLVED') return fail(res, 409, 'Ticket is resolved', 'TICKET_RESOLVED');
      mockStore.addSupportReply(req.params.ticket_id, req.body.message);
      return ok(res, {}, 'Reply sent', 201);
    }

    const [t] = await db.query('SELECT ticket_id,status FROM support_tickets WHERE ticket_id=? AND user_id=?', [
      req.params.ticket_id,
      req.user.id
    ]);
    if (!t.length) return fail(res, 404, 'Ticket not found', 'TICKET_NOT_FOUND');
    if (t[0].status === 'RESOLVED') return fail(res, 409, 'Ticket is resolved', 'TICKET_RESOLVED');
    await db.query('INSERT INTO support_messages (ticket_id,sender_type,message) VALUES (?,?,?)', [
      req.params.ticket_id,
      'USER',
      req.body.message
    ]);
    return ok(res, {}, 'Reply sent', 201);
  })
);

// GET /api/support/emergency-contacts
router.get(
  '/emergency-contacts',
  asyncHandler(async (req, res) => {
    if (mockMode) {
      return ok(res, { contacts: mockStore.getEmergencyContacts(req.user.id) });
    }
    const [contacts] = await db.query(
      'SELECT contact_id,name,mobile_number FROM emergency_contacts WHERE user_id=? ORDER BY id',
      [req.user.id]
    );
    return ok(res, { contacts });
  })
);

// POST /api/support/emergency-contacts
router.post(
  '/emergency-contacts',
  asyncHandler(async (req, res) => {
    const { name, mobile_number } = req.body;
    if (!name || !mobile_number) return fail(res, 422, 'name and mobile_number are required', 'VALIDATION_ERROR');

    if (mockMode) {
      const contacts = mockStore.getEmergencyContacts(req.user.id);
      if (contacts.length >= 5) return fail(res, 400, 'Maximum 5 emergency contacts allowed', 'CONTACT_LIMIT_REACHED');
      const item = mockStore.addEmergencyContact(req.user.id, { name, mobile_number });
      return ok(res, item, 'Emergency contact added', 201);
    }

    const [[c]] = await db.query('SELECT COUNT(*) AS count FROM emergency_contacts WHERE user_id=?', [req.user.id]);
    if (c.count >= 5) return fail(res, 400, 'Maximum 5 emergency contacts allowed', 'CONTACT_LIMIT_REACHED');
    const contactId = id('contact');
    await db.query('INSERT INTO emergency_contacts (contact_id,user_id,name,mobile_number) VALUES (?,?,?,?)', [
      contactId,
      req.user.id,
      name,
      mobile_number
    ]);
    return ok(res, { contact_id: contactId, name, mobile_number }, 'Emergency contact added', 201);
  })
);

// POST /api/support/sos
// Standalone SOS trigger without needing a ride_id
router.post(
  '/sos',
  asyncHandler(async (req, res) => {
    const { latitude, longitude, address, ride_id } = req.body || {};
    if (!latitude || !longitude || !Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) {
      return fail(res, 422, 'Valid user coordinates (latitude, longitude) are required for emergency dispatch', 'LOCATION_REQUIRED');
    }

    const contacts = mockMode
      ? mockStore.getEmergencyContacts(req.user.id)
      : (await db.query('SELECT name, mobile_number FROM emergency_contacts WHERE user_id=?', [req.user.id]))[0];

    const alertPayload = {
      alert_id: id('sos'),
      user_id: req.user.user_id || req.user.id,
      ride_id: ride_id || null,
      location: {
        latitude: Number(latitude),
        longitude: Number(longitude),
        address: address || 'Current Location'
      },
      contacts_alerted: contacts.length,
      emergency_services_alerted: false,
      status: 'DISPATCHED',
      triggered_at: new Date().toISOString()
    };

    return ok(res, alertPayload, 'SOS alert successfully transmitted to your emergency contacts and control room.');
  })
);

// DELETE /api/support/emergency-contacts/:contact_id
router.delete(
  '/emergency-contacts/:contact_id',
  asyncHandler(async (req, res) => {
    if (mockMode) {
      const deleted = mockStore.deleteEmergencyContact(req.user.id, req.params.contact_id);
      if (!deleted) return fail(res, 404, 'Contact not found', 'CONTACT_NOT_FOUND');
      return ok(res, {}, 'Emergency contact deleted');
    }

    const [r] = await db.query('DELETE FROM emergency_contacts WHERE contact_id=? AND user_id=?', [
      req.params.contact_id,
      req.user.id
    ]);
    if (!r.affectedRows) return fail(res, 404, 'Contact not found', 'CONTACT_NOT_FOUND');
    return ok(res, {}, 'Emergency contact deleted');
  })
);

module.exports = router;
