/* eslint-disable operator-linebreak */
/* eslint-disable quotes */
const Apify = require("apify");

const { log } = Apify.utils;
const { basicSEO } = require("./seo.js");

Apify.main(async () => {
    const {
        startUrl,
        proxy,
        seoParams,
        userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/84.0.4147.125 Safari/537.36",
        viewPortWidth,
        viewPortHeight,
        pageTimeout,
        maxRequestRetries,
        handlePageTimeoutSecs = 3600,
    } = await Apify.getValue("INPUT");

    const startUrls = [
        "https://lavu.com/",
        "https://pizzaonline.dominos.co.in/",
        "https://www.pizzahut.co.in/",
    ];

    log.info(`SEO audit for ${startUrl} started`);

    // Get web hostname
    const { hostname } = new URL(startUrl);

    log.info(`Web host name: ${hostname}`);

    const proxyConfiguration =
        (await Apify.createProxyConfiguration({
            ...proxy,
        })) || undefined;

    const requestQueue = await Apify.openRequestQueue();

    startUrls.forEach(async (s) => {
        await requestQueue.addRequest({ url: s });
    });

    const crawler = new Apify.PuppeteerCrawler({
        requestQueue,
        proxyConfiguration,
        useSessionPool: true,
        minConcurrency: 100,
        maxRequestsPerCrawl: 1,
        maxConcurrency: 1000,
        gotoFunction: async ({ request, page }) => {
            await page.setBypassCSP(true);

            if (userAgent) {
                await page.setUserAgent(userAgent);
            }

            if (viewPortWidth && viewPortHeight) {
                await page.setViewport({
                    height: viewPortHeight,
                    width: viewPortWidth,
                });
            }

            return page.goto(request.url, {
                waitUntil: "networkidle2",
                timeout: pageTimeout,
            });
        },
        launchPuppeteerOptions: {
            ignoreHTTPSErrors: true,
            args: [
                // needed for CSP to be actually bypassed, and fetch work inside the browser
                "--allow-running-insecure-content",
                "--disable-web-security",
                "--enable-features=NetworkService",
                "--ignore-certificate-errors",
            ],
        },
        maxRequestRetries,
        handlePageTimeoutSecs,
        handlePageFunction: async ({ request, page }) => {
            log.info("Start processing", { url: request.url });
            await page.addScriptTag({
                url: "https://code.jquery.com/jquery-3.2.1.min.js",
            });
            const data = {
                ...(await basicSEO(page, seoParams)),
            };
            await Apify.pushData(data);
            log.info(`${request.url}: Finished`);
        },

        handleFailedRequestFunction: async ({ request, error }) => {
            log.info(`Request ${request.url} failed too many times`);

            await Apify.pushData({
                url: request.url,
                isLoaded: false,
                errorMessage: error.message,
            });
        },
    });

    await crawler.run();

    log.info(`SEO audit for ${startUrl} finished.`);
});
