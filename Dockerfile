FROM node:20

# Install Python and archive tools
RUN apt update && \
    apt install -y python3 python3-pip python3-venv libfuzzy-dev p7zip-full unrar-free && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy Node.js files and install dependencies
COPY package*.json ./
RUN npm install --production

# Copy the full app
COPY . .

# Set up virtual environment and install Python deps
RUN python3 -m venv /opt/venv && \
    /opt/venv/bin/pip install --upgrade pip && \
    /opt/venv/bin/pip install -r py-scripts/requirements.txt

# Set PATH so the Python subprocesses use the venv automatically
ENV PATH="/opt/venv/bin:$PATH"

# Expose the port
EXPOSE 3000

# Start your app
CMD ["npm", "start"]

