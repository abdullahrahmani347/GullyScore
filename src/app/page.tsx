import LandingPage from '@/components/landing/LandingPage';

/**
 * Landing page root.
 *
 * The landing page is a 3D, GSAP-scroll-pinned experience. The previous
 * dashboard that lived at `/` has been moved to `/dashboard`.
 *
 * The LandingPage component is a client component (uses useLayoutEffect for
 * GSAP + dynamic import for R3F), so we just render it here.
 */
export default function Page() {
  return <LandingPage />;
}
