FROM node:20

# Install system dependencies
RUN apt-get update && \
    apt-get install -y python3 python3-pip python3-venv libfuzzy-dev p7zip-full libfreetype6-dev libpng-dev wget && \
    rm -rf /var/lib/apt/lists/*

# Download and install official unrar 7.0.7 from RARLab
RUN wget https://www.rarlab.com/rar/unrar-7.0.7.tar.gz && \
    tar -xzvf unrar-7.0.7.tar.gz && \
    cp unrar /usr/local/bin/unrar && \
    rm -rf unrar* && \
    chmod +x /usr/local/bin/unrar

# Set working directory
WORKDIR /app

# Copy Node.js dependencies files
COPY package*.json ./

# Install Node.js dependencies
RUN npm install --production

# Copy the rest of the application code
COPY . .

# Set up Python virtual environment and install Python dependencies
RUN python3 -m venv .venv && \
    .venv/bin/pip install --upgrade pip && \
    .venv/bin/pip install -r py-scripts/requirements.txt

# Ensure plots directory exists and is writable
RUN mkdir -p /app/plots && chmod 777 /app/plots

# Expose the port the app runs on
EXPOSE 3000

# Start the server
CMD ["npm", "start"] 