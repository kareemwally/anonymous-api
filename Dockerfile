FROM node:20

# Install Python 3, pip, venv, libfuzzy-dev, 7z, unrar, rar, and p7zip-rar for archive extraction
RUN apt-get update && \
    apt-get install -y python3 python3-pip python3-venv libfuzzy-dev p7zip-full unrar rar p7zip-rar libfreetype6-dev libpng-dev && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy Node.js files
COPY package*.json ./

# Install Node.js dependencies
RUN npm install --production

# Copy the rest of the application code
COPY . .

# Set up Python virtual environment and install Python dependencies
RUN python3 -m venv .venv && \
    .venv/bin/pip install --upgrade pip && \
    .venv/bin/pip install -r py-scripts/requirements.txt

# Expose the port the app runs on
EXPOSE 3000

# Start the server 
CMD ["npm", "start"] 