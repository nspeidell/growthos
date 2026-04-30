export const runtime = "edge";

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-white px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl prose prose-neutral">
        <h1>Privacy Policy</h1>
        <p className="text-sm text-neutral-500">Last updated: April 29, 2026</p>

        <h2>1. Introduction</h2>
        <p>
          GrowthOS (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) is an AI-powered marketing
          platform that helps businesses manage their social media presence. This Privacy Policy
          explains how we collect, use, and protect your information when you use our service at
          growthos-eo1.pages.dev.
        </p>

        <h2>2. Information We Collect</h2>
        <p>When you use GrowthOS, we may collect:</p>
        <ul>
          <li><strong>Account information:</strong> Your name, email address, and profile picture from Google OAuth sign-in.</li>
          <li><strong>Social media tokens:</strong> OAuth access tokens from platforms you connect (Facebook, Instagram, YouTube, X, Reddit). These are encrypted using AES-256-GCM before storage.</li>
          <li><strong>Content data:</strong> Posts, media, and other content you create or schedule through our platform.</li>
          <li><strong>Usage data:</strong> Analytics and metrics related to your published content&apos;s performance.</li>
        </ul>

        <h2>3. How We Use Your Information</h2>
        <p>We use your information to:</p>
        <ul>
          <li>Authenticate you and maintain your session.</li>
          <li>Publish and schedule content to your connected social media accounts on your behalf.</li>
          <li>Display analytics and performance metrics for your content.</li>
          <li>Generate AI-powered content suggestions and optimizations.</li>
        </ul>

        <h2>4. Data Storage and Security</h2>
        <p>
          Your data is stored on Cloudflare&apos;s global network using D1 (database) and R2
          (file storage). All OAuth tokens are encrypted at rest using AES-256-GCM encryption.
          We use HTTPS for all data in transit.
        </p>

        <h2>5. Third-Party Services</h2>
        <p>
          We integrate with the following platforms through their official APIs. When you connect
          an account, you authorize us to access your account according to the permissions you grant:
        </p>
        <ul>
          <li>Meta (Facebook &amp; Instagram)</li>
          <li>Google (YouTube)</li>
          <li>X (formerly Twitter)</li>
          <li>Reddit</li>
        </ul>
        <p>
          Each platform has its own privacy policy. We encourage you to review them before
          connecting your accounts.
        </p>

        <h2>6. Data Retention and Deletion</h2>
        <p>
          You can disconnect any social media account at any time from the Publisher page.
          When you disconnect an account, we delete the associated OAuth tokens immediately.
        </p>
        <p>
          To request complete deletion of all your data, please use our{" "}
          <a href="/api/data-deletion">data deletion</a> endpoint or contact us at the
          email below.
        </p>

        <h2>7. Your Rights</h2>
        <p>You have the right to:</p>
        <ul>
          <li>Access the personal data we hold about you.</li>
          <li>Request correction of inaccurate data.</li>
          <li>Request deletion of your data.</li>
          <li>Disconnect any connected social media accounts at any time.</li>
        </ul>

        <h2>8. Contact</h2>
        <p>
          For privacy-related questions or data requests, contact us at:{" "}
          <a href="mailto:reunionfamilychallenge@gmail.com">reunionfamilychallenge@gmail.com</a>
        </p>
      </div>
    </div>
  );
}
