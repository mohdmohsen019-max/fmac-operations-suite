export const MASTER_ADMIN_EMAIL = import.meta.env.VITE_MASTER_ADMIN_EMAIL

export const JOB_TITLES = [
  'Head of Operations',
  'Sports Activities Specialist',
  'Logistics Specialist',
  'Warehouse/Store Manager',
  'Customer Happiness Specialist',
  'Media Coordinator',
  'Manager',
  'Admin',
]

export const JOB_TITLE_PERMISSIONS = {
  'Head of Operations': {
    role: 'hod',
    permissions: {
      logistics: 'edit',
      fleet: 'edit',
      inventory: 'edit',
      helpDesk: 'edit',
      reports: ['bus_trips', 'maintenance', 'fuel', 'admin_costs', 'player_registration', 'complaints', 'inventory', 'media', 'projects'],
    },
  },
  'Sports Activities Specialist': {
    role: 'staff',
    permissions: {
      logistics: 'edit',
      fleet: 'edit',
      inventory: 'view',
      helpDesk: 'view',
      reports: ['bus_trips', 'maintenance', 'fuel', 'admin_costs'],
    },
  },
  'Logistics Specialist': {
    role: 'staff',
    permissions: {
      logistics: 'edit',
      fleet: 'edit',
      inventory: 'view',
      helpDesk: 'view',
      reports: ['bus_trips', 'maintenance', 'fuel', 'admin_costs'],
    },
  },
  'Warehouse/Store Manager': {
    role: 'store_manager',
    permissions: {
      logistics: 'view',
      fleet: 'view',
      inventory: 'edit',
      helpDesk: 'view',
      reports: ['inventory'],
    },
  },
  'Customer Happiness Specialist': {
    role: 'chr',
    permissions: {
      logistics: 'view',
      fleet: 'view',
      inventory: 'view',
      helpDesk: 'edit',
      reports: ['player_registration', 'complaints'],
    },
  },
  'Media Coordinator': {
    role: 'media',
    permissions: {
      logistics: 'view',
      fleet: 'view',
      inventory: 'view',
      helpDesk: 'view',
      reports: ['media'],
    },
  },
  'Manager': {
    role: 'manager',
    permissions: {
      logistics: 'view',
      fleet: 'view',
      inventory: 'view',
      helpDesk: 'view',
      reports: [],
    },
  },
  'Admin': {
    role: 'admin_viewer',
    permissions: {
      logistics: 'view',
      fleet: 'view',
      inventory: 'view',
      helpDesk: 'view',
      reports: [],
    },
  },
}
