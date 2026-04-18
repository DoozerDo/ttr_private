# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - alert [ref=e2]
  - main [ref=e3]:
    - generic [ref=e4]:
      - heading "Your beta account is ready" [level=1] [ref=e5]
      - paragraph [ref=e6]: Your account exists, but beta access is not active yet. Redeem your invite code to continue.
      - generic [ref=e7]:
        - link "Redeem access code" [ref=e8] [cursor=pointer]:
          - /url: /redeem?email=synthetic-login%2B1776485738321-9aet0q%40targetthisrole.local&next=%2Fbaseline
        - link "Back to login" [ref=e9] [cursor=pointer]:
          - /url: /auth/login
      - paragraph [ref=e10]: If you do not have a code yet, ask the person who invited you for the next step.
```