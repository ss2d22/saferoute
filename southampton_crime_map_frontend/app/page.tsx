"use client";

import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import Link from "next/link";
import { Shield, MapPin, AlertTriangle, TrendingUp, Users, Bike, Clock, ArrowRight, Route, Lock, BarChart3, Globe, Zap, Database, Server } from 'lucide-react';
import { motion } from "framer-motion";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 overflow-hidden">
        {/* Background Elements */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent" />
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        </div>

        <div className="container mx-auto px-4">
          <motion.div
            className="max-w-4xl mx-auto text-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
              <MapPin className="h-4 w-4" />
              Now Available in Southampton, UK
            </div>
            <h1 className="text-5xl md:text-6xl font-bold mb-6 text-balance">
              Safety-Aware Routing for{" "}
              <span className="text-primary">Southampton</span>
            </h1>
            <p className="text-xl text-muted-foreground mb-8 text-pretty max-w-2xl mx-auto">
              Navigate Southampton with confidence using real-time route planning combined with historical crime data analysis for safer walking and cycling routes.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" asChild>
                <Link href="/app">
                  Open Map <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="#how-it-works">Learn How It Works</Link>
              </Button>
            </div>
          </motion.div>

          <motion.div
            className="mt-16 max-w-5xl mx-auto"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <Card className="p-6 backdrop-blur-sm bg-card/50 border-border/50 shadow-xl">
              <div className="aspect-video bg-gradient-to-br from-primary/20 via-background to-primary/10 rounded-lg flex items-center justify-center relative overflow-hidden">
                {/* Decorative Map Grid */}
                <div className="absolute inset-0 opacity-20">
                  <div className="absolute inset-0 bg-[linear-gradient(to_right,currentColor_1px,transparent_1px),linear-gradient(to_bottom,currentColor_1px,transparent_1px)] bg-[size:40px_40px] text-primary" />
                </div>
                
                {/* Mock Route Lines */}
                <svg className="absolute inset-0 w-full h-full" viewBox="0 0 800 450">
                  {/* Background route (less safe) */}
                  <path
                    d="M 100 350 Q 250 250, 400 300 T 700 250"
                    fill="none"
                    stroke="hsl(var(--risk-high))"
                    strokeWidth="4"
                    strokeOpacity="0.6"
                    strokeDasharray="8 4"
                  />
                  {/* Recommended route (safer) */}
                  <path
                    d="M 100 350 Q 200 300, 400 280 T 700 220"
                    fill="none"
                    stroke="hsl(var(--risk-low))"
                    strokeWidth="6"
                    strokeOpacity="0.9"
                  />
                  {/* Start pin */}
                  <circle cx="100" cy="350" r="10" fill="hsl(var(--primary))" />
                  {/* End pin */}
                  <circle cx="700" cy="220" r="10" fill="hsl(var(--primary))" />
                </svg>

                <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
                <div className="absolute bottom-6 left-6 right-6">
                  <div className="flex gap-4 flex-wrap">
                    <div className="bg-card/90 backdrop-blur-sm px-4 py-2 rounded-lg border border-border">
                      <div className="text-sm text-muted-foreground">
                        Safety Score
                      </div>
                      <div className="text-2xl font-bold text-primary">
                        87/100
                      </div>
                    </div>
                    <div className="bg-card/90 backdrop-blur-sm px-4 py-2 rounded-lg border border-border">
                      <div className="text-sm text-muted-foreground">
                        Risk Level
                      </div>
                      <div className="text-2xl font-bold text-risk-low">Low</div>
                    </div>
                    <div className="bg-card/90 backdrop-blur-sm px-4 py-2 rounded-lg border border-border">
                      <div className="text-sm text-muted-foreground">
                        Hotspots
                      </div>
                      <div className="text-2xl font-bold">2</div>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>
        </div>
      </section>

      {/* Problem/Solution Section */}
      <section id="product" className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-12 max-w-6xl mx-auto">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              <div className="h-12 w-12 rounded-lg bg-destructive/10 flex items-center justify-center mb-6">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
              <h2 className="text-3xl font-bold mb-4">The Problem</h2>
              <p className="text-muted-foreground mb-4">
                Traditional navigation apps optimize for speed and distance,
                completely ignoring safety factors. Walking the fastest route
                might take you through high-crime areas, especially at night.
              </p>
              <ul className="space-y-2 text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-destructive mt-1">•</span>
                  <span>No consideration for crime statistics</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-destructive mt-1">•</span>
                  <span>Time-of-day risks completely ignored</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-destructive mt-1">•</span>
                  <span>No hotspot warnings along your route</span>
                </li>
              </ul>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-6">
                <Shield className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-3xl font-bold mb-4">Our Solution</h2>
              <p className="text-muted-foreground mb-4">
                SafeRoute uses H3 hexagonal spatial indexing (~73m cells) to analyze UK Police crime data across Southampton. We provide multiple route alternatives with detailed risk assessments using time-weighted and recency-weighted crime patterns.
              </p>
              <ul className="space-y-2 text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-1">✓</span>
                  <span>Real-time routing with OpenRouteService</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-1">✓</span>
                  <span>Time-of-day aware risk scoring</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-1">✓</span>
                  <span>H3 hexagonal grid for precise analysis</span>
                </li>
              </ul>
            </motion.div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">How SafeRoute Works</h2>
            <p className="text-xl text-muted-foreground">
              Advanced spatial analysis for safer navigation
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-7xl mx-auto">
            {[
              {
                icon: MapPin,
                step: "1",
                title: "Choose Destination",
                description:
                  "Select your starting point and destination on the interactive Southampton map",
              },
              {
                icon: Database,
                step: "2",
                title: "H3 Grid Analysis",
                description:
                  "Our H3 hexagonal spatial index analyzes crime patterns across 73-meter resolution cells",
              },
              {
                icon: Route,
                step: "3",
                title: "Multiple Routes",
                description:
                  "OpenRouteService generates walking, cycling, and driving alternatives for comparison",
              },
              {
                icon: Shield,
                step: "4",
                title: "Safety Scoring",
                description:
                  "View time-weighted safety scores, risk levels, and hotspot warnings for each route",
              },
            ].map((item, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                <Card className="p-6 hover:shadow-lg transition-shadow h-full">
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                    <item.icon className="h-6 w-6 text-primary" />
                  </div>
                  <div className="text-sm font-medium text-primary mb-2">
                    Step {item.step}
                  </div>
                  <h3 className="text-xl font-bold mb-2">{item.title}</h3>
                  <p className="text-muted-foreground text-sm">
                    {item.description}
                  </p>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Technical Features Section */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Powered by Advanced Technology</h2>
            <p className="text-xl text-muted-foreground">
              Enterprise-grade architecture for reliable safety analysis
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {[
              {
                icon: Database,
                title: "H3 Spatial Indexing",
                description:
                  "Uber's H3 hexagonal grid system (Resolution 10) provides ~73m edge cells for precise crime data aggregation and efficient spatial queries.",
              },
              {
                icon: Zap,
                title: "Redis Caching",
                description:
                  "Lightning-fast response times with Redis-based caching layer for frequently accessed routes and safety data.",
              },
              {
                icon: Server,
                title: "Background Processing",
                description:
                  "Celery-based automated crime data ingestion from UK Police API with periodic grid rebuilding for up-to-date information.",
              },
              {
                icon: Clock,
                title: "Time-Weighted Scoring",
                description:
                  "Sophisticated algorithm adjusts risk scores based on time of day, crime recency, and historical patterns.",
              },
              {
                icon: Lock,
                title: "JWT Authentication",
                description:
                  "Secure user authentication with route history tracking and personalized safety preferences.",
              },
              {
                icon: Route,
                title: "Multi-Modal Routing",
                description:
                  "OpenRouteService integration supports walking, cycling, and driving profiles with real-time route generation.",
              },
            ].map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                <Card className="p-6 hover:shadow-lg transition-shadow h-full">
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
                  <p className="text-muted-foreground text-sm">
                    {feature.description}
                  </p>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Use Cases Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Built For Southampton</h2>
            <p className="text-xl text-muted-foreground">
              Whether you're a local or visiting the city
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {[
              {
                icon: Users,
                title: "For Locals",
                description:
                  "Know your city better. Discover safer routes for your daily Southampton commute and evening walks.",
                features: [
                  "Save frequent routes",
                  "View route history",
                  "Custom safety preferences",
                ],
              },
              {
                icon: Globe,
                title: "For Visitors",
                description:
                  "Navigate Southampton confidently. Get local safety insights before exploring the city center and waterfront.",
                features: [
                  "Real-time safety data",
                  "Multiple route options",
                  "Hotspot warnings",
                ],
              },
              {
                icon: Bike,
                title: "For Students",
                description:
                  "Safe routes to University of Southampton campuses. Perfect for late-night study sessions and early morning classes.",
                features: [
                  "Walking & cycling routes",
                  "Time-of-day awareness",
                  "Campus area coverage",
                ],
              },
            ].map((useCase, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                <Card className="p-6 hover:shadow-lg transition-shadow h-full">
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-6">
                    <useCase.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-2xl font-bold mb-3">{useCase.title}</h3>
                  <p className="text-muted-foreground mb-4">
                    {useCase.description}
                  </p>
                  <ul className="space-y-2">
                    {useCase.features.map((feature, idx) => (
                      <li
                        key={idx}
                        className="flex items-center gap-2 text-sm text-muted-foreground"
                      >
                        <span className="text-primary">✓</span>
                        {feature}
                      </li>
                    ))}
                  </ul>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Safety & Data Section */}
      <section id="safety" className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-12"
            >
              <h2 className="text-4xl font-bold mb-4">Safety & Data</h2>
              <p className="text-xl text-muted-foreground">
                Transparency and accuracy you can trust
              </p>
            </motion.div>

            <div className="grid md:grid-cols-2 gap-8">
              <Card className="p-6">
                <BarChart3 className="h-8 w-8 text-primary mb-4" />
                <h3 className="text-xl font-bold mb-3">UK Police Data</h3>
                <p className="text-muted-foreground">
                  We use official UK Police API data for Southampton, processed through our H3 spatial index. Historical crime patterns are analyzed with time-weighted and recency-weighted algorithms for accurate risk assessment.
                </p>
              </Card>

              <Card className="p-6">
                <Lock className="h-8 w-8 text-primary mb-4" />
                <h3 className="text-xl font-bold mb-3">Your Privacy</h3>
                <p className="text-muted-foreground">
                  We never share your location or route history. All data is encrypted with JWT authentication, and you control what gets saved to your account.
                </p>
              </Card>

              <Card className="p-6">
                <Clock className="h-8 w-8 text-primary mb-4" />
                <h3 className="text-xl font-bold mb-3">Time-of-Day Awareness</h3>
                <p className="text-muted-foreground">
                  Crime patterns change throughout the day. Our algorithm dynamically adjusts risk scores based on when you're traveling for more accurate safety assessments.
                </p>
              </Card>

              <Card className="p-6">
                <MapPin className="h-8 w-8 text-primary mb-4" />
                <h3 className="text-xl font-bold mb-3">Southampton Coverage</h3>
                <p className="text-muted-foreground">
                  Complete coverage of Southampton including city center, university campuses, waterfront areas, and residential neighborhoods with regular data updates.
                </p>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-12"
            >
              <h2 className="text-4xl font-bold mb-4">
                Frequently Asked Questions
              </h2>
            </motion.div>

            <Accordion type="single" collapsible className="space-y-4">
              <AccordionItem value="item-1" className="bg-card rounded-lg px-6">
                <AccordionTrigger className="text-left">
                  How is the safety score calculated?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  Safety scores (0-100) are calculated using H3 hexagonal cells (~73m resolution) to analyze crime density along your route. We apply time-weighted and recency-weighted algorithms that factor in crime severity, time-of-day patterns, and historical trends. Routes are broken into segments for fine-grained analysis. Higher scores mean safer routes.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-2" className="bg-card rounded-lg px-6">
                <AccordionTrigger className="text-left">
                  How fresh is the crime data?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  We use official UK Police API data with automated background processing via Celery workers. Our system periodically ingests new data and rebuilds the H3 spatial grid to ensure you always have the most current crime statistics for Southampton.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-3" className="bg-card rounded-lg px-6">
                <AccordionTrigger className="text-left">
                  Which areas of Southampton are covered?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  SafeRoute covers all of Southampton including the city center, Ocean Village, Bedford Place, Portswood, Highfield (University area), Southampton Common, and all residential neighborhoods where UK Police data is available.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-4" className="bg-card rounded-lg px-6">
                <AccordionTrigger className="text-left">
                  Do I need an account to use SafeRoute?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  No! You can view safety heatmaps and get route recommendations without an account. Creating an account with JWT authentication allows you to save routes, view history, and customize safety preferences with secure data storage.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-5" className="bg-card rounded-lg px-6">
                <AccordionTrigger className="text-left">
                  What routing profiles are supported?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  SafeRoute integrates with OpenRouteService to provide multiple routing profiles including walking (foot-walking), cycling (cycling-regular), and driving (driving-car). Each profile generates optimized routes with safety scores calculated for your chosen mode of transport.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-6" className="bg-card rounded-lg px-6">
                <AccordionTrigger className="text-left">
                  Is my data private and secure?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  Yes. We use JWT-based authentication with encrypted data storage. We never share your location data or route history with third parties. Redis caching is used only for performance optimization, and you can delete your account and all associated data at any time from your settings.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="max-w-4xl mx-auto text-center"
          >
            <Card className="p-12 bg-gradient-to-br from-primary/10 via-card to-card border-primary/20">
              <h2 className="text-4xl font-bold mb-4">
                Ready to Navigate Southampton Safely?
              </h2>
              <p className="text-xl text-muted-foreground mb-8">
                Try SafeRoute today and discover safer routes across the city
              </p>
              <Button size="lg" asChild>
                <Link href="/app">
                  Open Map Now <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </Card>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-12">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <span className="font-bold">SafeRoute Southampton</span>
            </div>
            <p className="text-sm text-muted-foreground">
              © 2025 SafeRoute. Powered by UK Police data & OpenRouteService.
            </p>
            <div className="flex gap-6 text-sm text-muted-foreground">
              <Link href="/privacy" className="hover:text-foreground">
                Privacy
              </Link>
              <Link href="/terms" className="hover:text-foreground">
                Terms
              </Link>
              <Link href="/contact" className="hover:text-foreground">
                Contact
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
