# بناء صورة تشغّل خادم Node من server/ وتخدم ملفات المشروع من الجذر (لـ Fly.io وغيره)
FROM node:20-alpine
WORKDIR /app

COPY . .
WORKDIR /app/server
RUN npm ci --omit=dev

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "index.js"]
