import { motion } from 'framer-motion';
import logoMark from '@/assets/logo-mark.png';

/**
 * Premium full-page loading screen with animated Dealzflow logo.
 * Use inside <AppLayout> when page data is loading.
 */
export function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-5">
        {/* Logo with pulse-glow animation */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="relative"
        >
          {/* Glow ring */}
          <motion.div
            className="absolute inset-0 rounded-2xl bg-primary/20"
            animate={{
              scale: [1, 1.5, 1],
              opacity: [0.4, 0, 0.4],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
          {/* Inner glow */}
          <motion.div
            className="absolute inset-0 rounded-2xl bg-primary/10"
            animate={{
              scale: [1, 1.25, 1],
              opacity: [0.6, 0, 0.6],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: 0.3,
            }}
          />
          {/* Logo container */}
          <motion.div
            className="relative w-16 h-16 rounded-2xl bg-card border border-border/60 flex items-center justify-center shadow-lg"
            animate={{
              y: [0, -4, 0],
            }}
            transition={{
              duration: 2.5,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          >
            <img
              src={logoMark}
              alt="Dealzflow"
              className="w-9 h-9 object-contain"
            />
          </motion.div>
        </motion.div>

        {/* Animated dots */}
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-primary/60"
              animate={{
                opacity: [0.3, 1, 0.3],
                scale: [0.8, 1.2, 0.8],
              }}
              transition={{
                duration: 1.2,
                repeat: Infinity,
                ease: 'easeInOut',
                delay: i * 0.2,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
