# Stage 1: Build the Node.js frontend application
FROM node:14-alpine AS builder

# Set working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json files for dependency installation
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application's code
COPY . .

# Build the application (output will go to the 'dist' or 'build' directory, adjust as needed)
RUN npm run build

# Stage 2: Set up Nginx to serve the static files
FROM nginx:1.10.1-alpine

# Remove the default Nginx website configuration
#RUN rm /etc/nginx/conf.d/default.conf

# Copy a custom Nginx configuration file for reverse proxy
COPY nginx.conf /etc/nginx/nginx.conf

# Copy built application from previous stage to Nginx html directory
COPY --from=builder /app/build /usr/share/nginx/html

# Expose port 80 to be accessible outside of the container
EXPOSE 80

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
