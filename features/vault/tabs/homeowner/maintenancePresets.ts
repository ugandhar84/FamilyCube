// A broad catalog of common home maintenance tasks, grouped by category, so
// a parent can quick-add a reminder instead of always typing one from
// scratch [live-requested: "I want all possible maintenance add as many as
// possible"]. suggestedIntervalDays seeds AddHomeownerNoteSheet's default
// recurrence for that item — still fully editable before saving.
import type { HomeownerNoteCategory } from '@/store/homeownerNotesStore';

export interface MaintenancePreset {
  title: string;
  category: HomeownerNoteCategory;
  suggestedIntervalDays?: number;
}

export const MAINTENANCE_PRESETS: MaintenancePreset[] = [
  // HVAC
  { title: 'Replace HVAC air filter', category: 'hvac', suggestedIntervalDays: 90 },
  { title: 'Schedule HVAC professional tune-up', category: 'hvac', suggestedIntervalDays: 180 },
  { title: 'Clean AC condenser coils', category: 'hvac', suggestedIntervalDays: 365 },
  { title: 'Clear condensate drain line', category: 'hvac', suggestedIntervalDays: 180 },
  { title: 'Check thermostat batteries', category: 'hvac', suggestedIntervalDays: 365 },
  { title: 'Clean/replace humidifier filter', category: 'hvac', suggestedIntervalDays: 90 },
  { title: 'Inspect ductwork for leaks', category: 'hvac', suggestedIntervalDays: 365 },
  { title: 'Clean bathroom exhaust fans', category: 'hvac', suggestedIntervalDays: 180 },

  // Plumbing
  { title: 'Flush water heater', category: 'plumbing', suggestedIntervalDays: 365 },
  { title: 'Test sump pump', category: 'plumbing', suggestedIntervalDays: 90 },
  { title: 'Inspect for leaks under sinks', category: 'plumbing', suggestedIntervalDays: 90 },
  { title: 'Clean faucet aerators / showerheads', category: 'plumbing', suggestedIntervalDays: 180 },
  { title: 'Inspect toilet flappers for leaks', category: 'plumbing', suggestedIntervalDays: 180 },
  { title: 'Check main shutoff valve works', category: 'plumbing', suggestedIntervalDays: 365 },
  // Water filter — whole-house or under-sink
  { title: 'Replace whole-house water filter cartridge', category: 'plumbing', suggestedIntervalDays: 90 },
  { title: 'Replace under-sink/RO water filter', category: 'plumbing', suggestedIntervalDays: 180 },
  { title: 'Sanitize water filter housing', category: 'plumbing', suggestedIntervalDays: 365 },
  // Water softener
  { title: 'Check water softener salt level', category: 'plumbing', suggestedIntervalDays: 30 },
  { title: 'Add salt to water softener', category: 'plumbing', suggestedIntervalDays: 60 },
  { title: 'Clean water softener brine tank', category: 'plumbing', suggestedIntervalDays: 365 },
  { title: 'Test water hardness/softener performance', category: 'plumbing', suggestedIntervalDays: 180 },
  { title: 'Service/inspect water softener resin bed', category: 'plumbing', suggestedIntervalDays: 1825 },

  // Electrical
  { title: 'Test GFCI outlets', category: 'electrical', suggestedIntervalDays: 180 },
  { title: 'Inspect visible wiring/cords for wear', category: 'electrical', suggestedIntervalDays: 365 },
  { title: 'Check surge protector indicator lights', category: 'electrical', suggestedIntervalDays: 180 },
  { title: 'Test backup generator', category: 'electrical', suggestedIntervalDays: 90 },
  { title: 'Label breaker panel', category: 'electrical' },

  // Safety
  { title: 'Replace smoke detector batteries', category: 'safety', suggestedIntervalDays: 180 },
  { title: 'Replace carbon monoxide detector batteries', category: 'safety', suggestedIntervalDays: 180 },
  { title: 'Test smoke/CO detectors', category: 'safety', suggestedIntervalDays: 30 },
  { title: 'Check fire extinguisher pressure gauge', category: 'safety', suggestedIntervalDays: 180 },
  { title: 'Replace fire extinguisher (past expiry)', category: 'safety', suggestedIntervalDays: 1825 },
  { title: 'Test garage door auto-reverse safety', category: 'safety', suggestedIntervalDays: 180 },
  { title: 'Check window/door locks and security sensors', category: 'safety', suggestedIntervalDays: 180 },
  { title: 'Review/update family fire escape plan', category: 'safety', suggestedIntervalDays: 365 },

  // Appliances
  { title: 'Clean dryer vent/lint trap duct', category: 'appliance', suggestedIntervalDays: 180 },
  { title: 'Clean refrigerator coils', category: 'appliance', suggestedIntervalDays: 180 },
  { title: 'Replace fridge water filter', category: 'appliance', suggestedIntervalDays: 180 },
  { title: 'Clean dishwasher filter/spray arms', category: 'appliance', suggestedIntervalDays: 90 },
  { title: 'Run washing machine cleaning cycle', category: 'appliance', suggestedIntervalDays: 60 },
  { title: 'Descale coffee maker/kettle', category: 'appliance', suggestedIntervalDays: 60 },
  { title: 'Vacuum out range hood filter', category: 'appliance', suggestedIntervalDays: 90 },
  { title: 'Check garbage disposal for odor/clog', category: 'appliance', suggestedIntervalDays: 90 },

  // Exterior
  { title: 'Clean gutters and downspouts', category: 'exterior', suggestedIntervalDays: 180 },
  { title: 'Inspect roof for damage', category: 'exterior', suggestedIntervalDays: 365 },
  { title: 'Power wash siding/deck/patio', category: 'exterior', suggestedIntervalDays: 365 },
  { title: 'Seal/stain deck or fence', category: 'exterior', suggestedIntervalDays: 730 },
  { title: 'Inspect and caulk exterior windows/doors', category: 'exterior', suggestedIntervalDays: 365 },
  { title: 'Mow the lawn', category: 'exterior', suggestedIntervalDays: 7 },
  { title: 'Service lawn mower / sharpen mower blades', category: 'exterior', suggestedIntervalDays: 180 },
  { title: 'Fertilize lawn', category: 'exterior', suggestedIntervalDays: 90 },
  { title: 'Aerate and overseed lawn', category: 'exterior', suggestedIntervalDays: 365 },
  { title: 'Apply weed/pest control to lawn', category: 'exterior', suggestedIntervalDays: 90 },
  { title: 'Water lawn/irrigation check', category: 'exterior', suggestedIntervalDays: 14 },
  { title: 'Rake leaves', category: 'exterior', suggestedIntervalDays: 30 },
  { title: 'Edge lawn/walkways', category: 'exterior', suggestedIntervalDays: 30 },
  { title: 'Winterize outdoor faucets/sprinklers', category: 'exterior', suggestedIntervalDays: 365 },
  { title: 'Trim trees/shrubs away from house', category: 'exterior', suggestedIntervalDays: 180 },
  { title: 'Check driveway/walkway for cracks', category: 'exterior', suggestedIntervalDays: 365 },
  { title: 'Clean/inspect chimney', category: 'exterior', suggestedIntervalDays: 365 },
  { title: 'Check exterior grading/drainage away from foundation', category: 'exterior', suggestedIntervalDays: 365 },

  // Warranty / admin
  { title: 'Review appliance warranty expirations', category: 'warranty', suggestedIntervalDays: 365 },
  { title: 'Update home inventory / insurance photos', category: 'warranty', suggestedIntervalDays: 365 },
  { title: 'Renew home warranty / service plan', category: 'warranty', suggestedIntervalDays: 365 },

  // General
  { title: 'Deep clean gutters before storm season', category: 'general', suggestedIntervalDays: 180 },
  { title: 'Rotate/replace mattress', category: 'general', suggestedIntervalDays: 730 },
  { title: 'Test home Wi-Fi router / reboot schedule check', category: 'general', suggestedIntervalDays: 180 },
  { title: 'Check/replace water leak sensor batteries', category: 'general', suggestedIntervalDays: 180 },
];

export const CATEGORY_LABEL: Record<HomeownerNoteCategory, string> = {
  general: 'General',
  hvac: 'HVAC',
  plumbing: 'Plumbing',
  electrical: 'Electrical',
  appliance: 'Appliance',
  exterior: 'Exterior',
  safety: 'Safety',
  warranty: 'Warranty',
};

export const CATEGORY_EMOJI: Record<HomeownerNoteCategory, string> = {
  general: '🏠',
  hvac: '🌡️',
  plumbing: '🚰',
  electrical: '💡',
  appliance: '🔌',
  exterior: '🌳',
  safety: '🚨',
  warranty: '📄',
};
