FROM node:24-slim
WORKDIR /app
COPY package.json ./
COPY restaurant ./restaurant
COPY payroll ./payroll
COPY src ./src
COPY data ./data
ENV NODE_ENV=production PORT=4324 RESTAURANT_HOST=0.0.0.0 PAYROLL_DB_DIR=/var/data/payroll RESTAURANT_AUTH_DIR=/var/data/restaurant-auth
EXPOSE 4324
CMD ["node", "restaurant/server.ts"]
