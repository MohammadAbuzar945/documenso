import type { ImgHTMLAttributes } from 'react';


export type LogoProps = ImgHTMLAttributes<HTMLImageElement>;


export const BrandingLogo = ({ ...props }: LogoProps) => (
  <img
    src="/static/logo.png"
    alt="Nomia Signatures"
    className="h-14 w-auto"
    {...props}
  />
);
