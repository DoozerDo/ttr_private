$token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2OWM2MjYyNS1jOGY2LTRjZDctODFiZC1iNWM0ZTcyOWUwMzYiLCJlbWFpbCI6ImRvdWdAdHRyLmNvbSIsImlhdCI6MTc2NTkzMTU3NCwiZXhwIjoxNzY1OTM1MTc0fQ.Dy4_hGBeJ2WvaJGa4LSczNOSB-rE-ptox_G4xEZ4h9Y"
$baselineId = "e52e38e7-2b8a-4e7a-8625-6ecc14349ce3"

Invoke-RestMethod `
  -Method POST `
  -Uri "http://localhost:3001/baselines/$baselineId/reparse" `
  -Headers @{ Authorization = "Bearer $token" }