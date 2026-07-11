export const queryApi = {
    async realtimeQuote(secid, code) {
        const url = "https://push2.eastmoney.com/api/qt/stock/get?secid=" + secid + "&fields=f43,f44,f45,f46,f47,f48,f50,f52,f57,f58,f60,f62,f115,f116,f117,f168,f169,f170,f171";
        const res = await fetch(url);
        const d = await res.json();
        if (!d.data)
            return "No data for " + code;
        const q = d.data;
        var lines = [];
        lines.push("Quote: " + q.f58 + " (" + code + ")");
        lines.push("Price: " + (q.f43 / 1000).toFixed(3) + " | Chg: " + (q.f170 / 1000).toFixed(3) + " (" + (q.f171 || 0).toFixed(2) + "%)");
        lines.push("High: " + (q.f44 / 1000).toFixed(3) + " | Low: " + (q.f45 / 1000).toFixed(3));
        lines.push("Open: " + (q.f46 / 1000).toFixed(3) + " | Close: " + (q.f60 / 1000).toFixed(3));
        lines.push("Vol: " + (q.f47 / 1e4).toFixed(0) + "W | Amt: " + (q.f48 / 1e8).toFixed(2) + "B");
        lines.push("Turn: " + q.f168 + "% | PE: " + (q.f115 || '--') + " | PB: " + (q.f169 || '--'));
        return lines.join("\n");
    },
    async financeData(code) {
        var url = "https://datacenter.eastmoney.com/securities/api/data/v1/get?reportName=RPT_LICO_FN_CPD&columns=SECUCODE,SECURITY_NAME_ABBR,REPORTDATE,TOTAL_OPERATE_INCOME,YSTZ,PARENT_NETPROFIT,SJLTZ,WEIGHTAVG_ROE,BASIC_EPS,BPS,MGJYXJJE,XSMLL,DATATYPE&filter=(SECUCODE=\"" + code + ".SH\")&pageNumber=1&pageSize=6&sortTypes=-1&sortColumns=REPORTDATE";
        const res = await fetch(url);
        const d = await res.json();
        if (!d.result?.data?.length)
            return "No data for " + code;
        var lines = ["Period|Rev(B)|Rev%|Profit(B)|Profit%|GM|ROE", "-----|------|----|--------|-------|--|---"];
        for (const item of d.result.data) {
            const r = item.TOTAL_OPERATE_INCOME ? (item.TOTAL_OPERATE_INCOME / 1e8).toFixed(1) : "N/A";
            const p = item.PARENT_NETPROFIT ? (item.PARENT_NETPROFIT / 1e8).toFixed(2) : "N/A";
            lines.push((item.REPORTDATE?.slice(0, 10) || "") + "|" + r + "|" + (item.YSTZ || 0).toFixed(1) + "%|" + p + "|" + (item.SJLTZ || 0).toFixed(1) + "%|" + (item.XSMLL || 0).toFixed(1) + "%|" + (item.WEIGHTAVG_ROE || 0).toFixed(2) + "%");
        }
        return lines.join("\n");
    },
    async companyOverview(code) {
        var url = "https://datacenter.eastmoney.com/securities/api/data/v1/get?reportName=RPT_LICO_FN_CPD&columns=SECUCODE,SECURITY_NAME_ABBR,REPORTDATE,TOTAL_OPERATE_INCOME,PARENT_NETPROFIT,WEIGHTAVG_ROE,BASIC_EPS,BPS,MGJYXJJE,XSMLL&filter=(SECUCODE=\"" + code + ".SH\")&pageNumber=1&pageSize=1&sortTypes=-1&sortColumns=REPORTDATE";
        const res = await fetch(url);
        const d = await res.json();
        if (!d.result?.data?.[0])
            return "No data for " + code;
        const item = d.result.data[0];
        var lines = [];
        lines.push("Name: " + item.SECURITY_NAME_ABBR + " (" + code + ")");
        lines.push("Report: " + (item.REPORTDATE?.slice(0, 10) || ""));
        lines.push("Rev: " + (item.TOTAL_OPERATE_INCOME / 1e8 || 0).toFixed(1) + "B | Profit: " + (item.PARENT_NETPROFIT / 1e8 || 0).toFixed(2) + "B");
        lines.push("ROE: " + (item.WEIGHTAVG_ROE?.toFixed(2) || "N/A") + "% | GM: " + (item.XSMLL?.toFixed(1) || "N/A") + "%");
        lines.push("EPS: " + (item.BASIC_EPS || "N/A") + " | BPS: " + (item.BPS?.toFixed(2) || "N/A") + " | CF: " + (item.MGJYXJJE?.toFixed(2) || "N/A"));
        return lines.join("\n");
    }
};
