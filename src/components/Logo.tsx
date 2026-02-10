import { Link, useLocation } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';


interface LogoProps {
  className?: string;
  linkTo?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  animated?: boolean;
  variant?: 'smiley' | 'alt' | 'auto';
}

export function Logo({ className = '', linkTo = '/', size = 'md' }: LogoProps) {
  const location = useLocation();
  const [shouldAnimate, setShouldAnimate] = useState(false);
  const [hasScrolled, setHasScrolled] = useState(false);
  const scrollTriggeredRef = useRef(false);
  const lastPathRef = useRef(location.pathname);

  const sizeConfig = {
    sm: { width: 120, height: 40 },
    md: { width: 180, height: 60 },
    lg: { width: 240, height: 80 },
    xl: { width: 300, height: 100 },
  };

  const { width, height } = sizeConfig[size];

  // Animate on page change
  useEffect(() => {
    if (location.pathname !== lastPathRef.current) {
      lastPathRef.current = location.pathname;
      scrollTriggeredRef.current = false;
      setShouldAnimate(true);
      const timer = setTimeout(() => setShouldAnimate(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [location.pathname]);

  // Animate on first scroll (once per page)
  useEffect(() => {
    const handleScroll = () => {
      if (!scrollTriggeredRef.current && window.scrollY > 50) {
        scrollTriggeredRef.current = true;
        setHasScrolled(true);
        setShouldAnimate(true);
        const timer = setTimeout(() => setShouldAnimate(false), 1500);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Initial mount animation with delay
  useEffect(() => {
    const timer = setTimeout(() => {
      setShouldAnimate(true);
      setTimeout(() => setShouldAnimate(false), 1500);
    }, 800);
    return () => clearTimeout(timer);
  }, []);

  const logoContent = (
    <div className="relative inline-flex items-center" style={{ width, height }}>
      <svg
        width={width}
        height={height}
        viewBox="0 0 180 60"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`flex-shrink-0 transition-all duration-500 ${shouldAnimate ? 'animate-logo-glow' : ''}`}
      >
        <defs>
          <linearGradient id="oneduo_grad" x1="0" y1="0" x2="180" y2="60" gradientUnits="userSpaceOnUse">
            <stop stopColor="#10b981" />
            <stop offset="1" stopColor="#84cc16" />
          </linearGradient>
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>
        {/* Abstract Duo/1-2 Mark */}
        <path
          d="M10 15C10 12.2386 12.2386 10 15 10H25C27.7614 10 30 12.2386 30 15V45C30 47.7614 27.7614 50 25 50H15C12.2386 50 10 47.7614 10 45V15Z"
          fill="url(#oneduo_grad)"
          className="opacity-90"
        />
        <path
          d="M35 25C35 22.2386 37.2386 20 40 20H50C52.7614 20 55 22.2386 55 25V45C55 47.7614 52.7614 50 50 50H40C37.2386 50 35 47.7614 35 45V25Z"
          fill="url(#oneduo_grad)"
          className="opacity-70"
        />
        {/* Text */}
        <text
          x="65"
          y="42"
          fill="currentColor"
          style={{
            fontFamily: 'Inter, sans-serif',
            fontWeight: 800,
            fontSize: '26px',
            letterSpacing: '-0.02em'
          }}
          className="text-white dark:text-white"
        >
          OneDuo
        </text>
      </svg>
    </div>
  );

  if (linkTo) {
    return <Link to={linkTo} className={className}>{logoContent}</Link>;
  }

  return className ? <div className={className}>{logoContent}</div> : logoContent;
}

export function LogoText({ className = '' }: { className?: string; variant?: 'smiley' | 'alt' }) {
  return (
    <div className={`flex items-center ${className}`}>
      <svg
        width="180"
        height="60"
        viewBox="0 0 180 60"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="flex-shrink-0"
      >
        <defs>
          <linearGradient id="oneduo_grad_text" x1="0" y1="0" x2="180" y2="60" gradientUnits="userSpaceOnUse">
            <stop stopColor="#10b981" />
            <stop offset="1" stopColor="#84cc16" />
          </linearGradient>
        </defs>
        <path
          d="M10 15C10 12.2386 12.2386 10 15 10H25C27.7614 10 30 12.2386 30 15V45C30 47.7614 27.7614 50 25 50H15C12.2386 50 10 47.7614 10 45V15Z"
          fill="url(#oneduo_grad_text)"
          className="opacity-90"
        />
        <text
          x="40"
          y="42"
          fill="currentColor"
          style={{
            fontFamily: 'Inter, sans-serif',
            fontWeight: 800,
            fontSize: '26px',
            letterSpacing: '-0.02em'
          }}
          className="text-white dark:text-white"
        >
          OneDuo
        </text>
      </svg>
    </div>
  );
}

export function LogoIcon({ size = 32 }: { size?: number; variant?: 'smiley' | 'alt' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="flex-shrink-0"
      style={{ width: size, height: size }}
    >
      <defs>
        <linearGradient id="oneduo_grad_icon" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#10b981" />
          <stop offset="1" stopColor="#84cc16" />
        </linearGradient>
      </defs>
      <path
        d="M5 5C5 2.23858 7.23858 0 10 0H20C22.7614 0 25 2.23858 25 5V35C25 37.7614 22.7614 40 20 40H10C7.23858 40 5 37.7614 5 35V5Z"
        fill="url(#oneduo_grad_icon)"
      />
    </svg>
  );
}
