import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Logo } from "@/components/Logo";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#030303] text-white px-6">
      <Logo size="lg" className="mb-12" />
      <h1 className="mb-4 text-6xl font-bold text-cyan-400">404</h1>
      <p className="mb-8 text-xl text-white/50">Oops! Page not found</p>
      <Link 
        to="/" 
        className="px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-400 text-black font-semibold hover:opacity-90 transition-opacity"
      >
        Return to Home
      </Link>
    </div>
  );
};

export default NotFound;
