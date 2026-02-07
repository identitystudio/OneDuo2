import { Link, useLocation } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import logoIcon from '@/assets/oneduo-logo-icon.png';

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
      <img
        src={logoIcon}
        alt="OneDuo"
        width={width}
        height={height}
        className={`flex-shrink-0 object-contain transition-all duration-500 ${shouldAnimate ? 'animate-logo-glow' : ''}`}
        style={{ width, height }}
      />
    </div>
  );

  if (linkTo) {
    return <Link to={linkTo} className={className}>{logoContent}</Link>;
  }

  return className ? <div className={className}>{logoContent}</div> : logoContent;
}

export function LogoText({ className = '' }: { className?: string; variant?: 'smiley' | 'alt' }) {
  return (
    <img
      src={logoIcon}
      alt="OneDuo"
      width={120}
      height={60}
      className={`flex-shrink-0 object-contain ${className}`}
    />
  );
}

export function LogoIcon({ size = 32 }: { size?: number; variant?: 'smiley' | 'alt' }) {
  return (
    <img
      src={logoIcon}
      alt="OneDuo"
      width={size * 2}
      height={size}
      className="flex-shrink-0 object-contain"
      style={{ width: size * 2, height: size }}
    />
  );
}
