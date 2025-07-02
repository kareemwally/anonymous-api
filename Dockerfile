FROM node:20

# Install Python 3, pip, libfuzzy-dev, 7z, and unrar-free for archive extraction
RUN apt update && \
    apt install -y python3 python3-pip libfuzzy-dev p7zip-full unrar-free && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy Node.js files
COPY package*.json ./

# Install Node.js dependencies
RUN npm install --production

# Copy the rest of the application code
COPY . .

# Install Python dependencies globally (no virtualenv)
RUN pip3 install --upgrade pip && \
    pip3 install -r py-scripts/requirements.txt

# Expose the port the app runs on
EXPOSE 3000

# Start the server
CMD ["npm", "start"]
