"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Shield, Moon, Sun, LogOut, User, Settings, History } from 'lucide-react';
import { useTheme } from "next-themes";
import { useAuth } from "@/contexts/auth-context";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from 'next/navigation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export function Navbar() {
  const { theme, setTheme } = useTheme();
  const { isAuthenticated, user, logout } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const isMapPage = pathname === "/app";

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, section: string) => {
    if (pathname !== "/") {
      return;
    }
    
    e.preventDefault();
    const element = document.querySelector(section);
    if (element) {
      const offset = 80;
      const elementPosition = element.getBoundingClientRect().top + window.pageYOffset;
      window.scrollTo({
        top: elementPosition - offset,
        behavior: "smooth"
      });
    }
  };

  const handleSignOut = async () => {
    await logout();
    router.push("/");
  };

  const getUserInitials = () => {
    if (!user?.email) return "U";
    return user.email.charAt(0).toUpperCase();
  };

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled || isMapPage
          ? "bg-background/80 backdrop-blur-xl border-b border-border/50 shadow-sm"
          : "bg-transparent"
      }`}
    >
      <div className="container mx-auto px-6">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2.5 text-xl font-bold hover:opacity-80 transition-opacity">
            <Shield className="h-6 w-6 text-primary" />
            <span className="bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
              SafeRoute
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-8">
            <Link
              href="/#product"
              onClick={(e) => handleNavClick(e, "#product")}
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Product
            </Link>
            <Link
              href="/#how-it-works"
              onClick={(e) => handleNavClick(e, "#how-it-works")}
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              How It Works
            </Link>
            <Link
              href="/#safety"
              onClick={(e) => handleNavClick(e, "#safety")}
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Safety
            </Link>
            <Link
              href="/#faq"
              onClick={(e) => handleNavClick(e, "#faq")}
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              FAQ
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label="Toggle theme"
              className="rounded-full"
            >
              <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            </Button>

            {isAuthenticated ? (
              <>
                <Button variant="ghost" asChild className="hidden sm:flex">
                  <Link href="/app">Open Map</Link>
                </Button>
                
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="rounded-full">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                          {getUserInitials()}
                        </AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel className="font-normal">
                      <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">My Account</p>
                        <p className="text-xs leading-none text-muted-foreground truncate">
                          {user?.email}
                        </p>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => router.push("/dashboard")}>
                      <User className="mr-2 h-4 w-4" />
                      Dashboard
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => router.push("/history")}>
                      <History className="mr-2 h-4 w-4" />
                      Route History
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => router.push("/settings")}>
                      <Settings className="mr-2 h-4 w-4" />
                      Settings
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
                      <LogOut className="mr-2 h-4 w-4" />
                      Sign Out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <>
                <Button variant="ghost" asChild>
                  <Link href="/auth/login">Sign In</Link>
                </Button>
                <Button asChild className="rounded-full">
                  <Link href="/auth/register">Sign Up</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
