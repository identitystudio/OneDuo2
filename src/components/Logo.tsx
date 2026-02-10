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
    sm: { width: 80, height: 40 },
    md: { width: 120, height: 60 },
    lg: { width: 160, height: 80 },
    xl: { width: 200, height: 100 },
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
        viewBox="0 0 120 60"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`flex-shrink-0 transition-all duration-500 ${shouldAnimate ? 'animate-logo-glow' : ''}`}
      >
        <defs>
          <linearGradient id="oneduo_grad" x1="0" y1="0" x2="120" y2="60" gradientUnits="userSpaceOnUse">
            <stop stopColor="#6366f1" />
            <stop offset="1" stopColor="#a855f7" />
          </linearGradient>
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>
        {/* Abstract Duo/1-2 Mark */}
        <path
          d="M20 15C20 12.2386 22.2386 10 25 10H35C37.7614 10 40 12.2386 40 15V45C40 47.7614 37.7614 50 35 50H25C22.2386 50 20 47.7614 20 45V15Z"
          fill="url(#oneduo_grad)"
          className="opacity-90"
        />
        <path
          d="M45 25C45 22.2386 47.2386 20 50 20H60C62.7614 20 65 22.2386 65 25V45C65 47.7614 62.7614 50 60 50H50C47.2386 50 45 47.7614 45 45V25Z"
          fill="url(#oneduo_grad)"
          className="opacity-70"
        />
        {/* Text */}
        <text
          x="75"
          y="42"
          fill="currentColor"
          style={{
            fontFamily: 'Inter, sans-serif',
            fontWeight: 800,
            fontSize: '22px',
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
        width="120"
        height="60"
        viewBox="0 0 120 60"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="flex-shrink-0"
      >
        <defs>
          <linearGradient id="oneduo_grad_text" x1="0" y1="0" x2="120" y2="60" gradientUnits="userSpaceOnUse">
            <stop stopColor="#6366f1" />
            <stop offset="1" stopColor="#a855f7" />
          </linearGradient>
        </defs>
        <path
          d="M20 15C20 12.2386 22.2386 10 25 10H35C37.7614 10 40 12.2386 40 15V45C40 47.7614 37.7614 50 35 50H25C22.2386 50 20 47.7614 20 45V15Z"
          fill="url(#oneduo_grad_text)"
          className="opacity-90"
        />
        <text
          x="45"
          y="42"
          fill="currentColor"
          style={{
            fontFamily: 'Inter, sans-serif',
            fontWeight: 800,
            fontSize: '22px',
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
          <stop stopColor="#6366f1" />
          <stop offset="1" stopColor="#a855f7" />
        </linearGradient>
      </defs>
      <path
        d="M5 5C5 2.23858 7.23858 0 10 0H30C32.7614 0 35 2.23858 35 5V35C35 37.7614 32.7614 40 30 40H10C7.23858 40 5 37.7614 5 35V5Z"
        fill="url(#oneduo_grad_icon)"
      />
    </svg>
  );
}
