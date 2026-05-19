#!/bin/bash

# Secure private key entry (no echo, no history)
read -s -p "Enter private key (0x...): " PRIVATE_KEY
echo

if [ -z "$PRIVATE_KEY" ]; then
  echo "Error: No private key provided"
  exit 1
fi

# Run signing + test
PRIVATE_KEY="$PRIVATE_KEY" npx tsx sign-and-test.ts
