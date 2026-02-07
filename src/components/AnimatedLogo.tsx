interface AnimatedLogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export default function AnimatedLogo({ size = 'md', className = '' }: AnimatedLogoProps) {
  const sizeClasses = {
    sm: 'text-lg',
    md: 'text-xl',
    lg: 'text-2xl',
  };

  return (
    <span className={`font-display font-semibold tracking-tight inline-flex ${sizeClasses[size]} ${className}`}>
      <span className="text-foreground">See</span>
      <span className="text-primary font-bold">VA</span>
      <span className="text-foreground">done</span>
    </span>
  );
}
