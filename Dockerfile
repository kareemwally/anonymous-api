FROM node:20

# Install system dependencies
RUN apt-get update && \
    apt-get install -y python3 python3-pip python3-venv libfuzzy-dev p7zip-full unrar-free && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy Node.js dependencies files
COPY package*.json ./

# Install Node.js dependencies
RUN npm install --production

# Copy the rest of the application code
COPY . .

# Create Python virtual environment and install Python dependencies
RUN python3 -m venv .venv && \
    .venv/bin/pip install --upgrade pip && \
    .venv/bin/pip install -r py-scripts/requirements.txt

# Expose the port the app runs on
EXPOSE 3000

# Start the server
CMD ["npm", "start"]

