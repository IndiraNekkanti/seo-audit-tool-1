/* eslint-disable comma-dangle */
/* eslint-disable max-len */
/* eslint-disable operator-linebreak */
/* eslint-disable quotes */
const Apify = require("apify");
const axios = require("axios");

const { log } = Apify.utils;
const { basicSEO } = require("./seo.js");

Apify.main(async () => {
    const response = await axios.get(
        "http://174.138.49.21:8080/getdata?secret=indhu&pageSize=10"
    );
    const {
        startUrl,
        proxy,
        seoParams,
        userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/84.0.4147.125 Safari/537.36",
        viewPortWidth,
        viewPortHeight,
        pageTimeout,
        maxRequestRetries = 5,
        handlePageTimeoutSecs = 36000,
    } = await Apify.getValue("INPUT");

    const startUrls = response.data.data;

    log.info(`SEO audit for ${JSON.stringify(startUrls)} started`);

    const proxyConfiguration =
        (await Apify.createProxyConfiguration({
            ...proxy,
        })) || undefined;

    const requestQueue = await Apify.openRequestQueue();

    startUrls.forEach(async (s) => {
        await requestQueue.addRequest({ url: s.url, uniqueKey: `${s.id}` });
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
            await page.setDefaultNavigationTimeout(0);
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
            const data = {
                ...(await basicSEO(request, page, seoParams)),
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
