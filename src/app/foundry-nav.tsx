import Link from "next/link";

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/intelligence", label: "Intelligence" },
  { href: "/opportunities", label: "Opportunities" },
  { href: "/#review-queue", label: "Review Queue" },
  { href: "/calendar", label: "Calendar" },
];

export function FoundryNav() {
  return (
    <nav className="foundry-nav" aria-label="Foundry navigation">
      <Link className="foundry-brand" href="/">
        Tavern Cellar Foundry
      </Link>
      <div className="foundry-nav-links">
        {navItems.map((item) => (
          <Link className="foundry-nav-link" href={item.href} key={item.href}>
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
