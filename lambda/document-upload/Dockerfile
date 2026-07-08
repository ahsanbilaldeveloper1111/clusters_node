# Multi-stage build — compiles TypeScript inside Docker, runs on AWS Lambda Node 20
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM public.ecr.aws/lambda/nodejs:20
COPY --from=builder /app/dist/index.js ${LAMBDA_TASK_ROOT}/
CMD ["index.handler"]
