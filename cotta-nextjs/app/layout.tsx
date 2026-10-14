import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
 metadataBase: new URL(process.env.SITE_URL || 'https://cotta.mybizsite.co'),
 title:'קוטה | COTTA — פיצה עם אופי בתל אביב',
 description:'קוטה — פיצה בעבודת יד של השפית נרקיס אלפי. פיצות דקות וקריספיות, מנות לחלוקה ואווירה תל אביבית. גאולה 44, תל אביב.',
 openGraph:{
  title:'COTTA — פיצה עם אופי',
  description:'פיצה בעבודת יד. גאולה 44, תל אביב.',
  siteName:'COTTA',locale:'he_IL',type:'website',
  images:[{url:'/images/cotta-social.jpg',width:1200,height:630,alt:'COTTA — פיצה עם אופי בתל אביב'}],
 },
 twitter:{card:'summary_large_image',title:'COTTA — פיצה עם אופי',description:'פיצה בעבודת יד. גאולה 44, תל אביב.',images:['/images/cotta-social.jpg']},
};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="he" dir="rtl"><body>{children}</body></html>}
