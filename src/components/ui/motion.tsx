"use client";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  AnimatePresence,
  motion,
  useIsPresent,
  usePresenceData,
} from "motion/react";
import autoAnimate, { type AutoAnimationPlugin } from "@formkit/auto-animate";

const subscribe = (notify: () => void) => {
  const media = matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
};
function readMotion() {
  const style = getComputedStyle(document.documentElement);
  return [
    matchMedia("(prefers-reduced-motion: reduce)").matches ? "1" : "0",
    ...[
      "--motion-slide",
      "--motion-dialog",
      "--motion-list",
      "--motion-easing-values",
    ].map((token) => style.getPropertyValue(token).trim()),
  ].join("|");
}
export function useMotionTokens() {
  const value = useSyncExternalStore(
    subscribe,
    readMotion,
    () => "1|0|0|0|0,0,1,1",
  );
  const [reduced, slide, dialog, list, easing] = value.split("|");
  // Computed CSS may normalize 240ms to .24s. Consumers use milliseconds.
  const milliseconds = (time: string) =>
    (parseFloat(time) || 0) * (time.trim().endsWith("ms") ? 1 : 1000);
  return {
    reduced: reduced === "1",
    slide: reduced === "1" ? 0 : milliseconds(slide),
    dialog: reduced === "1" ? 0 : milliseconds(dialog),
    list: reduced === "1" ? 0 : milliseconds(list),
    ease: easing.split(",").map(Number) as [number, number, number, number],
  };
}
export function useListMotion<T extends HTMLElement>(animateSize = false) {
  const ref = useRef<T>(null);
  const { list, reduced } = useMotionTokens();
  useEffect(() => {
    if (!ref.current || reduced) return;
    const parent = ref.current;
    const options = {
      duration: list,
      easing: getComputedStyle(document.documentElement)
        .getPropertyValue("--motion-ease")
        .trim(),
    };
    // Filtering cards should animate position and visibility, never their dimensions.
    const positionOnly: AutoAnimationPlugin = (
      element,
      action,
      before,
      after,
    ) => {
      let frames: Keyframe[] = [{ opacity: 1 }, { opacity: 1 }];
      if (element !== parent) {
        if (action === "remain" && before && after) {
          frames = [
            {
              transform: `translate(${before.left - after.left}px, ${before.top - after.top}px)`,
            },
            { transform: "translate(0, 0)" },
          ];
        } else if (action === "add") {
          frames = [{ opacity: 0 }, { opacity: 1 }];
        } else if (action === "remove") {
          frames = [{ opacity: 1 }, { opacity: 0 }];
        }
      }
      return new KeyframeEffect(element, frames, options);
    };
    const controller = autoAnimate(
      parent,
      animateSize ? options : positionOnly,
    );
    return () => controller.disable();
  }, [list, reduced, animateSize]);
  return ref;
}
function useViewAccessibility(present: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (present) {
      element.removeAttribute("aria-hidden");
      return;
    }
    // Move focus out before hiding the outgoing view from assistive technology.
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && element.contains(focused))
      focused.blur();
    element.setAttribute("aria-hidden", "true");
  }, [present]);
  return ref;
}
function SlidePage({
  children,
  focusOnEnter,
}: {
  children: ReactNode;
  focusOnEnter?: string;
}) {
  const present = useIsPresent();
  const ref = useViewAccessibility(present);
  const direction = (usePresenceData() as number) || 1;
  const { slide, reduced, ease } = useMotionTokens();
  return (
    <motion.div
      className="slide-view__page"
      ref={ref}
      onAnimationComplete={() => {
        if (present && focusOnEnter)
          ref.current
            ?.querySelector<HTMLElement>(focusOnEnter)
            ?.focus({ preventScroll: true });
      }}
      inert={!present}
      data-exiting={!present || undefined}
      initial={{ x: reduced ? 0 : direction > 0 ? "100%" : "-100%" }}
      animate={{ x: 0 }}
      exit={{ x: reduced ? 0 : direction > 0 ? "-100%" : "100%" }}
      transition={{ duration: slide / 1000, ease }}
    >
      {children}
    </motion.div>
  );
}
export function SlideView({
  viewKey,
  children,
  direction = 1,
  className = "",
  focusOnEnter,
}: {
  viewKey: string;
  children: ReactNode;
  direction?: number;
  className?: string;
  focusOnEnter?: string;
}) {
  return (
    <div className={`slide-view ${className}`}>
      <AnimatePresence initial={false} custom={direction}>
        <SlidePage key={viewKey} focusOnEnter={focusOnEnter}>
          {children}
        </SlidePage>
      </AnimatePresence>
    </div>
  );
}
export { AnimatePresence };

export function AnimatedList({
  children,
  className,
  animateSize = false,
}: {
  children: ReactNode;
  className: string;
  animateSize?: boolean;
}) {
  const ref = useListMotion<HTMLDivElement>(animateSize);
  return (
    <div className={className} ref={ref}>
      {children}
    </div>
  );
}

function FadePage({
  children,
  focusOnEnter,
}: {
  children: ReactNode;
  focusOnEnter?: string;
}) {
  const present = useIsPresent();
  const ref = useViewAccessibility(present);
  const { dialog, ease } = useMotionTokens();
  return (
    <motion.div
      className="fade-view__page"
      ref={ref}
      onAnimationComplete={() => {
        if (present && focusOnEnter)
          ref.current
            ?.querySelector<HTMLElement>(focusOnEnter)
            ?.focus({ preventScroll: true });
      }}
      inert={!present}
      data-exiting={!present || undefined}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: dialog / 1000, ease }}
    >
      {children}
    </motion.div>
  );
}
export function FadeView({
  viewKey,
  children,
  className = "",
  focusOnEnter,
}: {
  viewKey: string;
  children: ReactNode;
  className?: string;
  focusOnEnter?: string;
}) {
  return (
    <div className={`fade-view ${className}`}>
      <AnimatePresence initial={false}>
        <FadePage key={viewKey} focusOnEnter={focusOnEnter}>
          {children}
        </FadePage>
      </AnimatePresence>
    </div>
  );
}
