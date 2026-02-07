import { useState, useEffect } from 'react';

type ABVariant = 'A' | 'B';

interface ABTestConfig {
  testName: string;
  variants: {
    A: string;
    B: string;
  };
}

interface ABTestResult {
  variant: ABVariant;
  headline: string;
}

/**
 * A/B testing hook that persists variant selection per session
 * Stores the variant in localStorage to ensure consistency during a session
 */
export function useABTest(config: ABTestConfig): ABTestResult {
  const storageKey = `ab_test_${config.testName}`;
  
  const [variant, setVariant] = useState<ABVariant>(() => {
    // Check localStorage first for existing assignment
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(storageKey);
      if (stored === 'A' || stored === 'B') {
        return stored;
      }
    }
    // Random assignment (50/50)
    return Math.random() < 0.5 ? 'A' : 'B';
  });

  useEffect(() => {
    // Persist the variant selection
    localStorage.setItem(storageKey, variant);
    
    // Track the variant shown (could integrate with analytics)
    console.log(`[A/B Test] ${config.testName}: Showing variant ${variant}`);
  }, [variant, storageKey, config.testName]);

  return {
    variant,
    headline: config.variants[variant],
  };
}

// Pre-defined headline variants for different pages
export const landingHeadlines = {
  testName: 'landing_headline_v1',
  variants: {
    A: "You're Your VA's AI Bitch.",
    B: "Fire them or give them OneDuo.",
  },
};

export const landingEcomHeadlines = {
  testName: 'ecom_headline_v1',
  variants: {
    A: "Your Product Videos Are Invisible to AI.",
    B: "Every AI Tool Is Blind to Your Product Videos.",
  },
};

export const landingFilmHeadlines = {
  testName: 'film_headline_v1',
  variants: {
    A: "AI Can't Watch Your Reference Footage.",
    B: "Your AI Has Never Seen a Single Frame.",
  },
};
