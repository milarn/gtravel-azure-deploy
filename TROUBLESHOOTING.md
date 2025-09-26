# 🚨 TROUBLESHOOTING: 500 Server Errors

## 📋 Quick Fix Steps

### Step 1: Restart Your Server
The most likely cause is that you need to restart your server to pick up the new routes:

```bash
# Navigate to server directory
cd server

# Stop the server (Ctrl+C if running)

# Start it again  
npm start
# OR
node server.js
```

### Step 2: Test Debug Endpoint
Open this URL in your browser while logged in:
```
http://localhost:3000/debug-endpoints.html
```

This will test all your endpoints and show what's working/failing.

### Step 3: Check Environment Variables
Make sure your `.env` file in the `server` directory has:

```env
AZURE_FUNCTION_BASE_URL=https://your-azure-function.azurewebsites.net/api/your-function-name
CLIENT_ID=your-client-id
CLIENT_SECRET=your-client-secret
SESSION_SECRET=your-session-secret
# ... other variables
```

### Step 4: Deploy Updated Azure Function
Your Azure Function needs the new `getDynamicStats` code:

1. Upload `server/azure-function-updated.js` to replace your current Azure Function
2. Make sure it's deployed and accessible
3. Test the new endpoint: `https://your-function.azurewebsites.net/api/your-function?action=getDynamicStats&domain=yourcompany.com`

## 🔍 Detailed Diagnostics

### Check Server Console
Look for these messages when the server starts:
```
✅ Server running on http://localhost:3000
🔒 Function proxy routes enabled: /api/function/*
```

### Check Azure Function
Test your function directly:
```
https://your-function-url?action=getDynamicStats&domain=gtravel.no
```

Should return JSON with statistics data.

### Common Issues & Solutions

**Issue 1: "AZURE_FUNCTION_BASE_URL is not defined"**
- Solution: Add the URL to your `.env` file

**Issue 2: "Function app error: 404"**
- Solution: Deploy the updated Azure Function code
- Make sure the function name matches your URL

**Issue 3: "Authentication failed"** 
- Solution: Make sure you're logged in to the dashboard first
- Check that your session is valid

**Issue 4: "Domain not authorized"**
- Solution: Verify your company domain is in the CompanyAccess table
- Check that the domain matches exactly

## 📊 Expected Working State

When everything works correctly:

1. **Cards show:** "Laster..." → Real data
2. **Console shows:** No 500 errors
3. **Network tab:** All requests return 200
4. **Debug page:** All tests pass

## 🛠 Manual Test Commands

Test each endpoint manually in browser console:

```javascript
// Test authentication
fetch('/auth/user', {credentials: 'include'}).then(r => r.json()).then(console.log);

// Test debug endpoint  
fetch('/api/function/debug', {credentials: 'include'}).then(r => r.json()).then(console.log);

// Test files endpoint
fetch('/api/function/files', {credentials: 'include'}).then(r => r.json()).then(console.log);

// Test stats endpoint
fetch('/api/function/stats', {credentials: 'include'}).then(r => r.json()).then(console.log);
```

## 📞 What to Check If Still Failing

1. **Server logs:** Look for error messages in the terminal
2. **Browser Network tab:** Check the actual error responses
3. **Azure Function logs:** Check for errors in Azure portal
4. **Database access:** Verify stored procedures are accessible
5. **Authentication:** Confirm you're properly logged in

The key is that **both** the server AND Azure Function need to be updated and restarted for the dynamic cards to work!