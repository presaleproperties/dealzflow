import { motion } from 'framer-motion';
import logoMark from '@/assets/logo-mark.png';

/**
 * Premium full-page loading screen with animated Dealzflow logo.
 * Centers perfectly in the viewport with a breathing glow effect.
 */
export function PageLoader() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-6">
        {/* Logo with layered glow */}
        <motion.div
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="relative flex items-center justify-center"
        >
          {/* Outer glow ring */}
          <motion.div
            className="absolute w-24 h-24 rounded-3xl bg-primary/15"
            animate={{
              scale: [1, 1.6, 1],
              opacity: [0.5, 0, 0.5],
            }}
            transition={{
              duration: 2.4,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
          {/* Inner glow ring */}
          <motion.div
            className="absolute w-20 h-20 rounded-2xl bg-primary/10"
            animate={{
              scale: [1, 1.3, 1],
              opacity: [0.7, 0, 0.7],
            }}
            transition={{
              duration: 2.4,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: 0.4,
            }}
          />

          {/* Logo container with gentle float */}
          <motion.div
            className="relative w-[72px] h-[72px] rounded-2xl bg-card border border-border/50 flex items-center justify-center"
            style={{
              boxShadow:
                '0 0 0 1px hsl(var(--border) / 0.1), 0 8px 30px -8px hsl(var(--primary) / 0.2), 0 2px 8px -2px hsl(var(--primary) / 0.1)',
            }}
            animate={{ y: [0, -6, 0] }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          >
            <motion.img
              src={logoMark}
              alt="Dealzflow"
              className="w-10 h-10 object-contain"
              animate={{ rotate: [0, 2, -2, 0] }}
              transition={{
                duration: 4,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
          </motion.div>
        </motion.div>

        {/* Brand name */}
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="text-sm font-semibold tracking-wide text-muted-foreground/60"
        >
          dealzflow
        </motion.p>

        {/* Animated progress bar */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.4 }}
          className="w-32 h-[3px] rounded-full bg-muted/50 overflow-hidden"
        >
          <motion.div
            className="h-full rounded-full bg-primary/50"
            animate={{ x: ['-100%', '100%'] }}
            transition={{
              duration: 1.4,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            style={{ width: '40%' }}
          />
        </motion.div>
      </div>
    </div>
  );
}
