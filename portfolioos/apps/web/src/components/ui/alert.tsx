import * as React from 'react';

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'destructive';
}

const variantClasses: Record<string, string> = {
  default: 'bg-muted/40 text-foreground border-border',
  destructive: 'border-destructive/50 text-destructive bg-destructive/5',
};

export function Alert({ className, variant = 'default', ...props }: AlertProps) {
  return (
    <div
      role="alert"
      className={`relative flex items-start gap-2 w-full rounded-lg border p-3 text-sm ${variantClasses[variant]} ${className ?? ''}`}
      {...props}
    />
  );
}

export function AlertDescription({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`text-sm ${className ?? ''}`} {...props} />;
}
