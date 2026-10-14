# COTTA + TableFlow

שלוש גרסאות עיצוב מלאות לאתר מסעדת COTTA, ולצדן מוצר נפרד להזמנת אוכל במסעדה ובטייק אווי.

## התחלה

נדרש Node.js 22.13 ומעלה. מומלץ Node 24 LTS. הגדירו `MONGO_URI` ב־`.env` של הפרויקט או של תיקיית העבודה. נדרש MongoDB Atlas או replica set מקומי, כדי לשמור על אישורי מקום והזמנות אטומיים.

```sh
npm install
npm run dev
```

Next.js serves the website, reservations, orders, admin and kitchen from port 3000. There is one production server.

```sh
npm run build
npm start
```

## שלושת העיצובים

- `http://localhost:3000/?design=rosso` — אדום־קרם, טיפוגרפיה נועזת וצילום פיצה גדול.
- `http://localhost:3000/?design=notte` — כהה, זהב וחוויית ערב אלגנטית, עם צילום גדול ותפריט פתוח.
- `http://localhost:3000/?design=sole` — צהוב־זית, צילום בקשת וכרטיסים מעוגלים, ים־תיכוני ובהיר.

בכל גרסה: RTL, מובייל, תפריט מלא עם 19 מנות האוכל והמחירים שהמשתמש סיפק, 2 משקאות שמחיריהם אומתו בוולט, קטגוריות, חלון פרטי מנה, דף נפרד לכל מנה (`/dish/margherita` למשל), כמויות והערות, סל שמועבר לטייק אווי, פרטי העסק, מפה וקישורי טלפון ואינסטגרם. התמונות הורדו לתיקיית `public/images`, ולכן אין תלות ב־Unsplash/Wolt בעת הצגת התמונות. Google Fonts ומפת Google עדיין דורשים אינטרנט, עם גופני מערכת חלופיים.

הזמנת מקום מתבצעת באתר עצמו. בוחרים מספר סועדים, אזור, יום ושעה פנויה, וממלאים שם וטלפון. הבקשה מופיעה בממשק המנהל תחת ״הזמנות מקום״. המנהל מאשר ומשייך שולחן; אישור חוסם את השולחן לאורך כל משך הישיבה, כולל שעות חופפות. הלקוח רואה את האישור בקישור מעקב אישי באתר ויכול לבטל. אין מעבר לשירות הזמנה חיצוני. ברירת המחדל: ישיבה של 90 דקות, 4 מושבים לכל שולחן ואזור בפנים; יש להתאים את המושבים, האזורים והשעות ב״הגדרות ישיבה״. בקשות ממתינות אינן חוסמות שולחן, והאישור נבדק שוב בעסקה במסד הנתונים כדי למנוע אישורים חופפים. השעות מחושבות לפי Asia/Jerusalem. ביטול משחרר את השולחן; סימון הגעת אורחים וסיום ביקור זמין לצוות. אין שליחת SMS או אימייל — הסטטוס מופיע באתר.

## אפליקציית ההזמנות

- ניהול: `http://localhost:3000/order/admin`
- מטבח: `http://localhost:3000/order/kitchen`
- טייק אווי: `http://localhost:3000/order/takeaway`
- שם משתמש: **פיצה**, סיסמה: **123**.

מערכת עצמאית ב־`orders-app/`, ניתנת להרצה ללא האתר באמצעות `npm run orders`, וארוזה עם תפריט ותמונות ב־`deliverables/tableflow-orders/`. מדריך מלא: [orders-app/README.md](orders-app/README.md).

התכונות: QR ייחודי וחתום לכל שולחן, שם ומזהה לכל סועד בכל ביקור, מסד MongoDB עם מודלים של Mongoose משותף ומתמיד, ריכוז לפי שולחן וסועד, מספר סועדים, הערות, הדפסה להזמנה או לשולחן, מסך מטבח שמתעדכן בכל 3 שניות, סטטוסים, סגירת ביקור, זמינות מנות, העלאת וידאו ושינוי פרטי עסק. טייק אווי כולל פרטי לקוח, מועד איסוף מבוקש, מספר הזמנה וכפתור שיחה להסדרת תשלום. אין סליקת אשראי; הצוות מסמן תשלום שהתקבל בטלפון.

ניתן להטמיע את TableFlow באתר אחר בקישור או ב־iframe. כל מסעדה מקבלת מופע עצמאי עם מסד ופרטי עסק משלה. לפני הדפסת QR יש להגדיר דומיין או כתובת רשת שהטלפונים מגיעים אליה; `localhost` אינו נגיש לטלפונים אחרים.

## פריסה

Deploy the complete Next.js project to Vercel. Set MONGO_URI in Vercel environment variables; MongoDB Atlas stores application data and GridFS stores videos. All backend routes run within Next.js App Router.

The root Dockerfile builds and runs one Next.js server. Set MONGO_URI in the runtime environment.

## בדיקות ותיעוד

```sh
npm run test:orders
npm run build
```

הבדיקות מכסות הרשאות, חתימת QR, הפרדת סועדים וביקורים, מחירים מצד השרת, מניעת הזמנה כפולה, סטטוסים, תשלום טלפוני, זמינות ושמירה אחרי הפעלה מחדש. `scripts/browser-check.mjs` הוא מסלול QA עם Playwright ו־Chrome מקומי; דורש `npm install --no-save --prefix .qa playwright`. צילומי מסך נשמרים ב־`.qa/screenshots/`.

מקורות, תמונות להמחשה, מערכת הזמנת המקום וניסיון יצירת וידאו: [SOURCES.md](SOURCES.md). וידאו הביס לא נוצר כי Higgsfield דרש מנוי Plus. נבנתה העלאת וידאו אמיתי לכל מנה.

להפקת עותק עצמאי של שירות ההזמנות: `node scripts/package-orders.mjs`. הקוד אינו כולל סודות, מידע אישי של לקוחות או נתוני ביקורים בחבילות המסירה.

## MongoDB בלבד

נתוני האפליקציה כבר הועברו ל־MongoDB. קובץ SQLite הישן נשאר ב־orders-app/data כגיבוי מקומי בלבד, ומוחרג מ־Git, Docker וחבילות המסירה. כלי ההעברה ותלות SQLite בקוד הוסרו. יצירת מסד חדש נעשית על ידי מודלי Mongoose בעת הפעלת השירות.

הבדיקות מפעילות replica set מבודד באמצעות mongodb-memory-server, ואינן משתמשות ב־MONGO_URI של המשתמש. שלושת המסלולים מכסים הזמנות, הזמנת מקום, מניעת התנגשויות בין מופעי שרת ו־GridFS לסרטונים גדולים מ־16MB.

Next.js 16.4.1 / React 19.3.1. Video uploads use authenticated 1MB chunks (up to 20MB total) so each request remains small. MongoDB sessions persist login across function instances. `orders-app/server.mjs` is only the automated-test HTTP harness, never a production process.
