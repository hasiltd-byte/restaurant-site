import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {title:'קוטה | COTTA — פיצה עם אופי בתל אביב',description:'קוטה — פיצה בעבודת יד של השפית נרקיס אלפי. פיצות דקות וקריספיות, מנות לחלוקה ואווירה תל אביבית. גאולה 44, תל אביב.',openGraph:{title:'COTTA — פיצה עם אופי',description:'פיצה בעבודת יד. גאולה 44, תל אביב.',locale:'he_IL',type:'website'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="he" dir="rtl"><body>{children}</body></html>}
