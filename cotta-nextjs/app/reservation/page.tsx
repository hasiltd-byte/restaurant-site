import Booking from '../Booking';
export const metadata={title:'הזמנת מקום · COTTA',description:'הזמינו מקום בקוטה ועקבו אחרי אישור המסעדה ישירות באתר.'};
export default function ReservationPage(){return <main className="site rosso"><header><a href="/" className="wordmark"><small>PIZZA</small>COTTA</a><a href="/" className="text-link">חזרה לאתר ←</a></header><Booking/></main>}
