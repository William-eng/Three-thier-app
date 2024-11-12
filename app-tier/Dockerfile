# Stage 1: Build and Install Dependencies
FROM node:18.20-alpine3.19 

# Set working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json to leverage Docker caching for dependencies
COPY package*.json ./

# Install all dependencies
RUN npm install

# Copy the entire application code to the container
COPY . .

# Run the build script to prepare for production
#RUN npm run build

# Expose the application port
EXPOSE 4000

# Run the application with the start script
CMD ["npm", "start"]
