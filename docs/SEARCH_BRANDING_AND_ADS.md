# Search, Branding & Advertisement Architecture
## Document Version: 1.0.0 — Phase 01 Master Architecture
**Platform**: NEXORA Multi-Tenant SaaS E-Commerce Store Builder  
**Author**: Principal Software Architect & Senior Frontend Architect  
**Status**: APPROVED

---

## 1. Advanced Search & Filtering Architecture

A high-converting e-commerce platform requires sub-100ms multi-faceted product searching and filtering. NEXORA achieves this using a MongoDB Faceted Aggregation Pipeline backed by compound indexes and Redis query fingerprint caching.

```mermaid
flowchart TD
    subgraph Client["Client Storefront"]
        URL["URL State Query String<br/>?q=shirt&cat=apparel&color=navy&size=XL&min=1000&max=3000&sort=rating_desc"]
        FilterUI["Desktop Filter Sidebar & Mobile Drawer<br/>- Multi-select Checkboxes<br/>- Dual-Handle Price Slider<br/>- Real-time Product Count Badges"]
    end

    subgraph CacheLayer["Redis Query Cache"]
        Fingerprint{"SHA-256 Hash of<br/>(tenantId + QueryString)"}
        CacheHit["Return Cached Facet Response<br/>(< 5ms)"]
    end

    subgraph Engine["Search Execution Engine"]
        TextMatch["1. Full-Text & Token Match<br/>(title, description, tags, SKU, barcode)"]
        RangeMatch["2. Range & Attribute Match<br/>(price, stock > 0, category hierarchy)"]
        FacetPipeline["3. MongoDB $facet Aggregation Stage"]
        
        subgraph Facets["Parallel Aggregation Branches"]
            F_Results["Branch A: Paginated Product Cards"]
            F_Categories["Branch B: Category Tree Counts"]
            F_Brands["Branch C: Brand Facet Counts"]
            F_Price["Branch D: Min / Max Price Distribution"]
            F_Attributes["Branch E: Variant Attributes (Color, Size)"]
            F_Ratings["Branch F: Star Rating Buckets"]
        end
    end

    URL --> Fingerprint
    Fingerprint -- Hit --> CacheHit
    Fingerprint -- Miss --> TextMatch
    TextMatch --> RangeMatch --> FacetPipeline
    FacetPipeline --> F_Results & F_Categories & F_Brands & F_Price & F_Attributes & F_Ratings
    F_Results & F_Categories & F_Brands & F_Price & F_Attributes & F_Ratings --> FilterUI
```

### 1.1 MongoDB Faceted Aggregation Pipeline Specification
A single query execution returns both the filtered result set and dynamic facet counts for UI checkboxes:

```javascript
// Architecture Specification: Product Facet Aggregation
const aggregationPipeline = [
  // Stage 1: Tenant Boundary & Base Criteria
  {
    $match: {
      tenantId: ctx.tenantId,
      status: 'ACTIVE',
      ...(searchQuery ? { $text: { $search: searchQuery } } : {}),
      ...(categoryId ? { categoryId: categoryObjectId } : {}),
      basePrice: { $gte: minPrice, $lte: maxPrice }
    }
  },
  // Stage 2: Parallel Faceting
  {
    $facet: {
      products: [
        { $sort: sortStage },
        { $skip: (page - 1) * pageSize },
        { $limit: pageSize },
        {
          $project: {
            title: 1, slug: 1, basePrice: 1, compareAtPrice: 1,
            images: { $slice: ['$images', 2] }, totalStock: 1,
            averageRating: 1, reviewCount: 1, sku: 1
          }
        }
      ],
      totalCount: [{ $count: 'count' }],
      categoryFacets: [
        { $group: { _id: '$categoryId', count: { $sum: 1 } } }
      ],
      brandFacets: [
        { $match: { brandId: { $ne: null } } },
        { $group: { _id: '$brandId', count: { $sum: 1 } } }
      ],
      priceStats: [
        {
          $group: {
            _id: null,
            min: { $min: '$basePrice' },
            max: { $max: '$basePrice' }
          }
        }
      ],
      ratingFacets: [
        {
          $bucket: {
            groupBy: '$averageRating',
            boundaries: [0, 2, 3, 4, 5],
            default: 'other',
            output: { count: { $sum: 1 } }
          }
        }
      ]
    }
  }
];
```

---

## 2. Three-Tier Branding & Theme Engine

Branding in NEXORA is strictly hierarchical and isolated across three distinct spheres:

```mermaid
graph TD
    subgraph BrandingSpheres["Three-Tier Branding Separation"]
        subgraph Tier1["1. Global Platform Branding"]
            B1_Logo["NEXORA Platform Logo & Wordmark"]
            B1_Pal["Platform Dark/Slate Tech Palette"]
            B1_Routes["nexora.com, app.nexora.com, /superadmin"]
        end

        subgraph Tier2["2. NEXORA Official Store Branding"]
            B2_Logo["NEXORA Official Merchandise Identity"]
            B2_Pal["Flagship Premium Gold/Emerald Palette"]
            B2_Routes["store.nexora.com"]
        end

        subgraph Tier3["3. Autonomous Tenant Store Branding"]
            B3_Logo["Tenant Logo, Favicon & Tagline"]
            B3_Pal["Custom Dynamic CSS Tokens"]
            B3_Typo["Google Fonts: English & Bengali (Hind Siliguri)"]
            B3_Routes["<tenant>.nexora.shop & Custom CNAMEs"]
        end
    end

    Tier1 -.->|"NEVER Overwrites"| Tier3
    Tier2 -.->|"NEVER Overwrites"| Tier3
```

### 2.1 Dynamic CSS Variable Generation
The storefront injects design tokens at runtime via a single injected `<style id="nexora-theme-tokens">` tag, enabling instant theme updates without rebuilding frontend bundles:

```css
:root {
  --nexora-primary: #1E293B;
  --nexora-primary-fg: #FFFFFF;
  --nexora-secondary: #F1F5F9;
  --nexora-accent: #3B82F6;
  --nexora-background: #FFFFFF;
  --nexora-surface: #F8FAFC;
  --nexora-border: #E2E8F0;
  --nexora-font-heading: 'Plus Jakarta Sans', sans-serif;
  --nexora-font-body: 'Inter', sans-serif;
  --nexora-radius: 0.5rem;
}
```

### 2.2 Theme Draft, Preview, Publish & Rollback Lifecycle
1. **Draft Mode**: Store owner edits colors, typography, and logo in the Theme Studio. Edits save to `theme_configs.draftSnapshot`.
2. **Interactive Preview**: Live iframe loads storefront with `?preview_theme=draft&token=<signed_hmac>`, rendering unpublished changes in real-time.
3. **Publish Event**:
   - Creates a new revision record in `theme_revisions` containing the snapshot, user ID, and timestamp.
   - Promotes `draftSnapshot` to `publishedSnapshot`.
   - Flushes Redis cache key `tenant:theme:<tenantId>`.
4. **Instant Rollback**: Merchant can select any previous revision from the version history table and click "Restore", reverting the active storefront in < 50ms.

---

## 3. Google AdSense & Advertisement Architecture

NEXORA allows merchants on eligible subscription plans to monetize their traffic through Google AdSense or custom promotional banners while strictly safeguarding user privacy and conversion-critical checkout flows.

```mermaid
graph TD
    subgraph AdEngine["AdSense Slot Placement & Safety Engine"]
        Req["Shopper Navigates to Route"]
        CheckRoute{"Is Route Sensitive?<br/>(/checkout, /cart, /account, /payment)"}
        Block["SUPPRESS ALL ADS<br/>(Preserve checkout trust & conversion)"]
        
        Consent{"Is GDPR/CCPA / TCF<br/>Consent Granted?"}
        WaitConsent["Render Consent Banner / Withhold Ad Units"]
        
        Render["Inject Google AdSense Script<br/>& Render Configured Placement Slots"]
        
        subgraph Slots["Safe Storefront Placements"]
            S1["HEADER_LEADERBOARD (Top of Catalog)"]
            S2["SIDEBAR_RECTANGLE (Catalog Filter Column)"]
            S3["IN_FEED_NATIVE (Between Product Grid Items)"]
            S4["AFTER_PRODUCT_DETAILS (Below Customer Reviews)"]
            S5["FOOTER_BANNER (Above Storefront Footer)"]
        end
    end

    Req --> CheckRoute
    CheckRoute -- Yes --> Block
    CheckRoute -- No --> Consent
    Consent -- Denied / Pending --> WaitConsent
    Consent -- Approved --> Render
    Render --> S1 & S2 & S3 & S4 & S5
```

### 3.1 Strict Security & Policy Boundaries
1. **Protected Path Blacklist**:
   AdSense scripts and ad units are **STRICTLY FORBIDDEN** from rendering on:
   - `/cart`
   - `/checkout/*`
   - `/payment/*`
   - `/orders/confirmed`
   - `/account/*` (Login, Register, Password Reset, MFA)
   - Merchant Admin Dashboard (`/admin/*`)
2. **Tenant Ad Isolation**:
   - Publisher IDs (`ca-pub-XXXXXXXXXXXXXXXX`) are stored strictly within the tenant's `ad_configs` record.
   - Tenant A's publisher ID will never appear on Tenant B's store.
   - AdSense auto-ads can be toggled independently of manual ad unit slots.
3. **Consent Management Integration**:
   Complies with Google's EU User Consent Policy and IAB Transparency and Consent Framework (TCF v2.2), preventing ad script loading until user consent is captured.
