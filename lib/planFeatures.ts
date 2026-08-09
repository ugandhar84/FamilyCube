export type PlanKey = 'free' | 'pro' | 'ultimate';

export interface PlanFeature {
  text: string;
  included: boolean;
  subText?: string;
}

export const DEFAULT_PLAN_FEATURES: Record<PlanKey, PlanFeature[]> = {
  free: [
    { text: '1 pet profile',                    included: true  },
    { text: 'Daily health & wellness log',       included: true  },
    { text: 'Vet appointments & med tracking',   included: true  },
    { text: 'Weight, vaccines & insurance log',  included: true  },
    { text: '4 mood scans / day',                included: true  },
    { text: '3 health records / month',          included: true  },
    { text: '5 community feed posts / month',    included: true  },
    { text: '2 playdates / month',               included: true  },
    { text: 'Nearby pets discovery (GPS)',        included: true  },
    { text: 'Emergency SOS & lost pet alerts',   included: true  },
    { text: '7-day history',                     included: true  },
    { text: 'Video posts',                       included: false },
    { text: 'AI health tools',                   included: false },
  ],
  pro: [
    { text: 'All Free features, plus:',          included: true  },
    { text: 'Up to 5 pets',                      included: true  },
    { text: 'Family & caretaker sharing',         included: true  },
    { text: '10 mood scans / day',                included: true  },
    { text: 'Unlimited health records',           included: true  },
    { text: 'Unlimited posts + videos',           included: true  },
    { text: 'Unlimited playdates',                included: true  },
    { text: 'Community events & RSVP',            included: true  },
    { text: 'Full health history',                included: true  },
  ],
  ultimate: [
    { text: 'Everything in Pro, plus:',          included: true },
    { text: 'Instant AI Symptom Scanner',        included: true, subText: 'Photo-scan rashes, eyes, or digestion issues for immediate triage guidance.' },
    { text: '24/7 Virtual Vet Chat',             included: true, subText: 'Ask anything about diet, behavior, or medication side effects — any time, any night.' },
    { text: 'Personalized Behavior Coach',       included: true, subText: 'Step-by-step plans for anxiety, leash pulling, or barking — tailored to your pet\'s age and breed.' },
    { text: 'Breed-specific health tips',        included: true },
    { text: '24/7 pet health guidance',          included: true },
  ],
};
