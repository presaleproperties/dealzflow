// iOS-style haptic feedback utilities
// Uses the Vibration API with patterns that mimic iOS haptics

type HapticStyle = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' | 'selection' | 'tab' | 'fab';

const hapticPatterns: Record<HapticStyle, number | number[]> = {
  light: 10,
  medium: 20,
  heavy: 30,
  success: [10, 50, 10],
  warning: [20, 100, 20],
  error: [30, 100, 30, 100, 30],
  selection: 5,
  // Tab switch — crisp iOS-style "tick-tick" double pulse
  tab: [6, 22, 9],
  // Center "+" FAB — firmer "thump-pop" with a subtle echo for premium feel
  fab: [14, 18, 22, 30, 8],
};

export function triggerHaptic(style: HapticStyle = 'light'): void {
  // Check if vibration is supported
  if (!('vibrate' in navigator)) return;
  
  try {
    const pattern = hapticPatterns[style];
    navigator.vibrate(pattern);
  } catch (e) {
    // Silently fail if vibration is not available
  }
}

// Spring animation configurations for framer-motion
export const springConfigs = {
  // Snappy spring for quick interactions
  snappy: {
    type: 'spring' as const,
    stiffness: 400,
    damping: 30,
    mass: 1,
  },
  // Bouncy spring for playful animations
  bouncy: {
    type: 'spring' as const,
    stiffness: 300,
    damping: 20,
    mass: 0.8,
  },
  // Gentle spring for subtle movements
  gentle: {
    type: 'spring' as const,
    stiffness: 200,
    damping: 25,
    mass: 1,
  },
  // Stiff spring for immediate response
  stiff: {
    type: 'spring' as const,
    stiffness: 500,
    damping: 35,
    mass: 0.5,
  },
};

// Animation variants for common patterns
export const fadeInUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: springConfigs.gentle,
  },
};

export const scaleIn = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: { 
    opacity: 1, 
    scale: 1,
    transition: springConfigs.snappy,
  },
};

export const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
};

export const listItem = {
  hidden: { opacity: 0, x: -20 },
  visible: { 
    opacity: 1, 
    x: 0,
    transition: springConfigs.snappy,
  },
};

// Tap animation for buttons/cards
export const tapScale = {
  scale: 0.97,
  transition: springConfigs.stiff,
};

export const hoverScale = {
  scale: 1.02,
  transition: springConfigs.gentle,
};
