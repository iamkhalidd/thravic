import { COMPARE_CHECKED, compareRows, compareTools } from './content';

// Thravic beside the tools people already know. Used on the landing page and /compare.
export default function CompareTable() {
    return (
        <div className="lp-compare">
            <div className="lp-compare-scroll" role="region" aria-label="Comparison table" tabIndex={0}>
                <table>
                    <thead>
                        <tr>
                            <th scope="col"><span className="sr-only">Feature</span></th>
                            {compareTools.map(tool => <th key={tool} scope="col">{tool}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {compareRows.map(row => (
                            <tr key={row.label}>
                                <th scope="row">{row.label}</th>
                                {row.values.map((value, i) => <td key={compareTools[i]}>{value}</td>)}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p className="lp-compare-note">
                Checked against each product&apos;s public pages in {COMPARE_CHECKED}. Products change; if a row is out of date,
                {' '}<a href="/contact">tell us</a> and we&apos;ll fix it.
            </p>
        </div>
    );
}
