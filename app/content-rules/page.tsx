// app/content-rules/page.tsx

export default function ContentRulesPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-10 text-slate-800">
      <h1 className="text-3xl font-bold mb-4">Community Content Rules</h1>
      <p className="mb-4">Hyper to Be Free is built for faith, prayer, testimony, encouragement, and respectful community.</p>

      <h2 className="text-xl font-semibold mt-6 mb-2">Allowed</h2>
      <ul className="list-disc pl-6 mb-4">
        <li>Faith testimonies</li>
        <li>Prayer requests</li>
        <li>Encouraging messages</li>
        <li>Praise reports</li>
        <li>Respectful discussion</li>
      </ul>

      <h2 className="text-xl font-semibold mt-6 mb-2">Not Allowed</h2>
      <ul className="list-disc pl-6 mb-4">
        <li>Harassment, bullying, threats, or intimidation</li>
        <li>Hate speech or demeaning attacks</li>
        <li>Sexually explicit content</li>
        <li>Graphic violence</li>
        <li>Copyrighted videos, music, sermons, or clips you do not have permission to share</li>
        <li>Spam, scams, fundraising fraud, or impersonation</li>
        <li>Medical, legal, financial, or counseling advice presented as professional guidance</li>
        <li>Personal information about someone else without permission</li>
      </ul>

      <h2 className="text-xl font-semibold mt-6 mb-2">Moderation</h2>
      <p className="mb-4">
        We may remove content, hide posts, restrict accounts, or ban users to protect the community.
      </p>

      <h2 className="text-xl font-semibold mt-6 mb-2">Report Issues</h2>
      <p>Email: reports@hypertobefree.com</p>
    </main>
  );
}
