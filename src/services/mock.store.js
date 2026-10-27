const crypto = require('crypto');

function id(prefix = 'id') {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

const usersById = new Map();
const usersByMobile = new Map();

// Seed initial test user
const initialUser = {
  id: 1,
  user_id: 'usr_mock_001',
  name: 'Rahul Sharma',
  email: 'rahul@example.com',
  mobile_number: '9876543210',
  phone_verified: true,
  gender: 'Male',
  language: 'en',
  profile_photo_url: null,
  rating: 4.9,
  referral_code: 'NECAB50',
  is_active: true,
  profile_completed: true,
  wallet_balance: 250,
  current_latitude: 26.1445,
  current_longitude: 91.7362,
  created_at: new Date().toISOString()
};

usersById.set(initialUser.id, initialUser);
usersByMobile.set(initialUser.mobile_number, initialUser);

const savedAddresses = new Map();
savedAddresses.set(1, [
  {
    address_id: 'adr_mock_1',
    user_id: 1,
    label: 'HOME',
    name: 'Home',
    address: 'Bhangagarh, GS Road, Guwahati',
    latitude: 26.1584,
    longitude: 91.7684
  }
]);

const rides = new Map();
const supportTickets = new Map();
const emergencyContacts = new Map();

const primaryVehicleTypes = [
  {
    vehicle_type_id: 'BIKE',
    name: 'Bike',
    icon_url: 'https://cdn-icons-png.flaticon.com/512/3198/3198344.png',
    capacity: 1,
    base_fare: 25,
    per_km: 8,
    per_minute: 0.5,
    nearest_eta_minutes: 2,
    is_available: 1,
    description: 'Fast and affordable bike rides for 1 person'
  },
  {
    vehicle_type_id: 'AUTO',
    name: 'Auto',
    icon_url: 'https://cdn-icons-png.flaticon.com/512/3202/3202926.png',
    capacity: 3,
    base_fare: 35,
    per_km: 12,
    per_minute: 1,
    nearest_eta_minutes: 3,
    is_available: 1,
    description: 'Affordable auto rides at your doorstep'
  },
  {
    vehicle_type_id: 'MINI',
    name: 'Mini Cab',
    icon_url: 'https://cdn-icons-png.flaticon.com/512/75/75780.png',
    capacity: 4,
    base_fare: 50,
    per_km: 14,
    per_minute: 1.5,
    nearest_eta_minutes: 5,
    is_available: 1,
    description: 'Comfy hatchbacks for daily commute'
  },
  {
    vehicle_type_id: 'SEDAN',
    name: 'Sedan Prime',
    icon_url: 'https://cdn-icons-png.flaticon.com/512/3202/3202926.png',
    capacity: 4,
    base_fare: 70,
    per_km: 18,
    per_minute: 2,
    nearest_eta_minutes: 7,
    is_available: 1,
    description: 'Spacious sedans with top drivers'
  }
];

const vehicleTypes = [
  ...primaryVehicleTypes,
  {
    vehicle_type_id: 'CAB',
    name: 'Cab',
    icon_url: 'https://cdn-icons-png.flaticon.com/512/75/75780.png',
    capacity: 4,
    base_fare: 50,
    per_km: 14,
    per_minute: 1.5,
    nearest_eta_minutes: 5,
    is_available: 1
  },
  {
    vehicle_type_id: 'vt_bike',
    name: 'Bike',
    icon_url: 'https://cdn-icons-png.flaticon.com/512/3198/3198344.png',
    capacity: 1,
    base_fare: 25,
    per_km: 8,
    per_minute: 0.5,
    nearest_eta_minutes: 2,
    is_available: 1
  },
  {
    vehicle_type_id: 'vt_auto',
    name: 'Auto',
    icon_url: 'https://cdn-icons-png.flaticon.com/512/3202/3202926.png',
    capacity: 3,
    base_fare: 35,
    per_km: 12,
    per_minute: 1,
    nearest_eta_minutes: 3,
    is_available: 1
  },
  {
    vehicle_type_id: 'vt_cab',
    name: 'Cab',
    icon_url: 'https://cdn-icons-png.flaticon.com/512/75/75780.png',
    capacity: 4,
    base_fare: 50,
    per_km: 14,
    per_minute: 1.5,
    nearest_eta_minutes: 5,
    is_available: 1
  }
];

const banners = [
  {
    banner_id: 'ban_01',
    image_url: 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=800',
    title: '50% off on your first 3 rides!',
    redirect_type: 'PROMO',
    redirect_value: 'NECAB50',
    sort_order: 1
  },
  {
    banner_id: 'ban_02',
    image_url: 'https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?w=800',
    title: 'Safe & Sanitized Rides 24/7',
    redirect_type: 'URL',
    redirect_value: 'https://chalghar.com',
    sort_order: 2
  }
];

const drivers = [
  {
    driver_id: 'drv_01',
    name: 'Bikash Das',
    photo_url: null,
    rating: 4.85,
    total_trips: 1240,
    phone_masked: '+91 98******10',
    vehicle_type: 'Auto',
    vehicle_color: 'Green-Yellow',
    make_model: 'Bajaj RE Compact',
    registration_number: 'AS-01-AB-1234',
    latitude: 26.1550,
    longitude: 91.7700,
    vehicle_type_id: 'AUTO',
    is_available: 1
  },
  {
    driver_id: 'drv_02',
    name: 'Pranab Saikia',
    photo_url: null,
    rating: 4.92,
    total_trips: 870,
    phone_masked: '+91 98******21',
    vehicle_type: 'Mini Cab',
    vehicle_color: 'White',
    make_model: 'Maruti Suzuki WagonR',
    registration_number: 'AS-01-CD-5678',
    latitude: 26.1600,
    longitude: 91.7650,
    vehicle_type_id: 'MINI',
    is_available: 1
  },
  {
    driver_id: 'drv_03',
    name: 'Rahul Borah',
    photo_url: null,
    rating: 4.88,
    total_trips: 620,
    phone_masked: '+91 98******33',
    vehicle_type: 'Bike',
    vehicle_color: 'Black-Red',
    make_model: 'Hero Splendor Plus',
    registration_number: 'AS-01-EF-9012',
    latitude: 26.1510,
    longitude: 91.7620,
    vehicle_type_id: 'BIKE',
    is_available: 1
  },
  {
    driver_id: 'drv_04',
    name: 'Rakesh Sharma',
    photo_url: null,
    rating: 4.81,
    total_trips: 940,
    phone_masked: '+91 98******44',
    vehicle_type: 'Auto',
    vehicle_color: 'Yellow-Black',
    make_model: 'Piaggio Ape',
    registration_number: 'AS-01-JK-3421',
    latitude: 26.1530,
    longitude: 91.7680,
    vehicle_type_id: 'AUTO',
    is_available: 1
  },
  {
    driver_id: 'drv_05',
    name: 'Amit Kalita',
    photo_url: null,
    rating: 4.95,
    total_trips: 1540,
    phone_masked: '+91 98******55',
    vehicle_type: 'Sedan Prime',
    vehicle_color: 'Silver',
    make_model: 'Honda Amaze',
    registration_number: 'AS-01-GH-3456',
    latitude: 26.1620,
    longitude: 91.7580,
    vehicle_type_id: 'SEDAN',
    is_available: 1
  }
];

const promos = [
  {
    code: 'NECAB50',
    title: '50% Off First Ride',
    description: 'Get 50% discount up to ₹50',
    discount_type: 'PERCENT',
    discount_value: 50,
    max_discount: 50,
    min_fare: 50,
    valid_till: '2030-12-31T23:59:59Z',
    terms: 'Applicable once per user'
  },
  {
    code: 'FLAT20',
    title: 'Flat ₹20 Off',
    description: 'Get ₹20 discount on rides above ₹100',
    discount_type: 'FLAT',
    discount_value: 20,
    max_discount: 20,
    min_fare: 100,
    valid_till: '2030-12-31T23:59:59Z',
    terms: 'Valid on Mini & Sedan'
  }
];

const faqs = [
  {
    faq_id: 'faq_01',
    category: 'RIDES',
    question: 'How do I book a cab?',
    answer: 'Enter your pickup and drop locations on the home screen, select your vehicle type, and confirm booking.'
  },
  {
    faq_id: 'faq_02',
    category: 'PAYMENTS',
    question: 'What payment methods are supported?',
    answer: 'We accept Cash, NE CAB Wallet, UPI, and Credit/Debit Cards.'
  },
  {
    faq_id: 'faq_03',
    category: 'WALLET',
    question: 'How do I add money to wallet?',
    answer: 'Go to Wallet, tap Top Up, enter amount and complete payment via UPI or Card.'
  }
];

module.exports = {
  getUserById(rawId) {
    if (rawId == null) return null;
    const numericId = Number(rawId);
    if (usersById.has(numericId)) return usersById.get(numericId);
    for (const u of usersById.values()) {
      if (String(u.id) === String(rawId) || u.user_id === rawId) return u;
    }
    return null;
  },

  getUserByMobile(mobile) {
    return usersByMobile.get(mobile) || null;
  },

  getUserByEmail(email) {
    if (!email) return null;
    for (const u of usersById.values()) {
      if (u.email && u.email.toLowerCase() === email.toLowerCase()) {
        return u;
      }
    }
    return null;
  },

  deleteUser(userId) {
    const user = this.getUserById(userId);
    if (!user) return false;
    user.is_active = false;
    user.deletion_status = 'COMPLETED';
    user.deleted_at = new Date().toISOString();
    return true;
  },

  createMockUser(mobile, name = 'Test User', extra = {}) {
    const numericId = usersById.size + 1;
    const user = {
      id: numericId,
      user_id: id('usr'),
      name: extra.name || name,
      email: extra.email || null,
      mobile_number: mobile,
      phone_verified: true,
      gender: extra.gender || null,
      language: extra.language || 'en',
      profile_photo_url: null,
      rating: 5.0,
      referral_code: id('ref').slice(0, 12).toUpperCase(),
      is_active: true,
      profile_completed: Boolean(extra.name),
      wallet_balance: 250,
      current_latitude: null,
      current_longitude: null,
      created_at: new Date().toISOString()
    };

    usersById.set(numericId, user);
    usersByMobile.set(mobile, user);
    return user;
  },

  updateUser(rawId, updates) {
    let user = this.getUserById(rawId);
    if (!user) {
      user = this.createMockUser('9876543210');
    }
    Object.assign(user, updates);
    return user;
  },

  getSavedAddresses(userId) {
    return savedAddresses.get(Number(userId)) || [];
  },

  addSavedAddress(userId, data) {
    const list = this.getSavedAddresses(userId);
    const item = {
      address_id: id('adr'),
      user_id: Number(userId),
      label: data.label || 'OTHER',
      name: data.name,
      address: data.address,
      latitude: Number(data.latitude),
      longitude: Number(data.longitude)
    };
    list.unshift(item);
    savedAddresses.set(Number(userId), list);
    return item;
  },

  updateSavedAddress(userId, addressId, data) {
    const list = this.getSavedAddresses(userId);
    const idx = list.findIndex((a) => a.address_id === addressId);
    if (idx === -1) return null;
    list[idx] = { ...list[idx], ...data };
    return list[idx];
  },

  deleteSavedAddress(userId, addressId) {
    const list = this.getSavedAddresses(userId);
    const beforeLen = list.length;
    const filtered = list.filter((a) => a.address_id !== addressId);
    savedAddresses.set(Number(userId), filtered);
    return filtered.length < beforeLen;
  },

  getWalletTransactions(userId) {
    return [
      {
        txn_id: 'txn_mock_01',
        type: 'CREDIT',
        amount: 250,
        description: 'Welcome Bonus',
        balance_after: 250,
        created_at: new Date().toISOString()
      }
    ];
  },

  createRide(userId, data) {
    const rideId = id('ride');
    const rideOtp = String(Math.floor(1000 + Math.random() * 9000));
    const ride = {
      ride_id: rideId,
      user_id: Number(userId),
      vehicle_type_id: data.vehicle_type_id,
      estimate_id: data.estimate_id,
      status: 'SEARCHING',
      pickup_lat: data.pickup.latitude,
      pickup_lng: data.pickup.longitude,
      pickup_address: data.pickup.address,
      drop_lat: data.drop.latitude,
      drop_lng: data.drop.longitude,
      drop_address: data.drop.address,
      payment_method: data.payment_method || 'CASH',
      payment_status: 'PENDING',
      estimated_fare: data.estimated_fare,
      final_fare: null,
      discount: data.discount || 0,
      promo_code: data.promo_code || null,
      note_for_driver: data.note_for_driver || null,
      ride_otp: rideOtp,
      driver_id: null,
      timeline: [
        { status: 'SEARCHING', at: new Date().toISOString() }
      ],
      created_at: new Date().toISOString()
    };
    rides.set(rideId, ride);
    return ride;
  },

  getRide(rideId) {
    return rides.get(rideId) || null;
  },

  getUserRides(userId) {
    const list = [];
    for (const r of rides.values()) {
      if (String(r.user_id) === String(userId)) {
        list.push(r);
      }
    }
    return list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },

  getActiveRide(userId) {
    const activeStatuses = ['SEARCHING', 'DRIVER_ASSIGNED', 'DRIVER_ARRIVED', 'TRIP_STARTED', 'SCHEDULED'];
    for (const r of rides.values()) {
      if (String(r.user_id) === String(userId) && activeStatuses.includes(r.status)) {
        return r;
      }
    }
    return null;
  },

  getLatestRide(userId) {
    const pastStatuses = ['COMPLETED', 'CANCELLED_BY_USER', 'CANCELLED_BY_DRIVER'];
    const past = [];
    for (const r of rides.values()) {
      if (String(r.user_id) === String(userId) && pastStatuses.includes(r.status)) {
        past.push(r);
      }
    }
    past.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return past[0] || null;
  },

  cancelRide(rideId, reason) {
    const r = rides.get(rideId);
    if (!r) return null;
    r.status = 'CANCELLED_BY_USER';
    r.cancellation_reason = reason;
    r.timeline.push({ status: 'CANCELLED_BY_USER', at: new Date().toISOString() });
    return r;
  },

  getEmergencyContacts(userId) {
    return emergencyContacts.get(Number(userId)) || [];
  },

  addEmergencyContact(userId, data) {
    const list = this.getEmergencyContacts(userId);
    const item = {
      contact_id: id('contact'),
      user_id: Number(userId),
      name: data.name,
      mobile_number: data.mobile_number
    };
    list.push(item);
    emergencyContacts.set(Number(userId), list);
    return item;
  },

  deleteEmergencyContact(userId, contactId) {
    const list = this.getEmergencyContacts(userId);
    const beforeLen = list.length;
    const filtered = list.filter((c) => c.contact_id !== contactId);
    emergencyContacts.set(Number(userId), filtered);
    return filtered.length < beforeLen;
  },

  getSupportTickets(userId) {
    const list = [];
    for (const t of supportTickets.values()) {
      if (String(t.user_id) === String(userId)) {
        list.push(t);
      }
    }
    return list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },

  createSupportTicket(userId, data) {
    const ticketId = id('ticket');
    const ticket = {
      ticket_id: ticketId,
      user_id: Number(userId),
      category: data.category,
      ride_id: data.ride_id || null,
      subject: data.subject,
      message: data.message,
      status: 'OPEN',
      messages: [
        { sender_type: 'USER', message: data.message, created_at: new Date().toISOString() }
      ],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    supportTickets.set(ticketId, ticket);
    return ticket;
  },

  getSupportTicket(ticketId) {
    return supportTickets.get(ticketId) || null;
  },

  addSupportReply(ticketId, message) {
    const t = supportTickets.get(ticketId);
    if (!t) return null;
    t.messages.push({
      sender_type: 'USER',
      message,
      created_at: new Date().toISOString()
    });
    t.updated_at = new Date().toISOString();
    return t;
  },

  primaryVehicleTypes,
  vehicleTypes,
  banners,
  drivers,
  promos,
  faqs
};
