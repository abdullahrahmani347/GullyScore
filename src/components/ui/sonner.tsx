"use client"

import { Toaster as Sonner, ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      style={
        {
          "--normal-bg": "#1A1A2E",
          "--normal-text": "#F0F0F5",
          "--normal-border": "rgba(255,255,255,0.07)",
        } as React.CSSProperties
      }
      toastOptions={{
        style: {
          background: '#1A1A2E',
          border: '1px solid rgba(255,255,255,0.07)',
          color: '#F0F0F5',
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
