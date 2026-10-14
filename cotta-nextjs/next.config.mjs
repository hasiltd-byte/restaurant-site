export default {async rewrites(){return [{source:'/order/:path*',destination:`${process.env.ORDERS_INTERNAL_URL||'http://127.0.0.1:4100'}/:path*`}]}};
