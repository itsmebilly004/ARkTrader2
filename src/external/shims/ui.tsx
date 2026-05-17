import * as React from "react";
import { useIsMobile } from "@/hooks/use-mobile";

const TABLET_MAX = 1024;

export const useDevice = () => {
  const isMobile = useIsMobile();
  const [isTabletOrDesktop, setIsTabletOrDesktop] = React.useState(() => {
    if (typeof window === "undefined") return true;
    return window.innerWidth >= TABLET_MAX;
  });

  React.useEffect(() => {
    const onResize = () => setIsTabletOrDesktop(window.innerWidth >= TABLET_MAX);
    window.addEventListener("resize", onResize);
    onResize();
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const isTablet = !isMobile && !isTabletOrDesktop;
  const isDesktop = isTabletOrDesktop;

  return {
    isMobile,
    isTablet,
    isDesktop,
    isTabletOrMobile: !isDesktop,
  };
};

export const Loader: React.FC<{ is_fullscreen?: boolean }> = ({ is_fullscreen }) => (
  <div
    role="status"
    aria-label="Loading"
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: is_fullscreen ? "100vw" : "100%",
      height: is_fullscreen ? "100vh" : "100%",
      padding: "1rem",
    }}
  >
    <div
      style={{
        width: 32,
        height: 32,
        border: "3px solid hsl(var(--border))",
        borderTopColor: "hsl(var(--primary))",
        borderRadius: "50%",
        animation: "ark-spin 0.9s linear infinite",
      }}
    />
    <style>{`@keyframes ark-spin { to { transform: rotate(360deg); } }`}</style>
  </div>
);

export default { useDevice, Loader };
