$(function() {

    'use strict';

    /* ChartJS
     * -------
     * Here we will create a few charts using ChartJS
     */

    // Enable pusher logging - don't include this in production
    Pusher.logToConsole = true;

    var serverUrl = "/",
        members = [],
        pusher = new Pusher('cb2e26782a706d98e07e', {
            cluster: 'ap1',
            forceTLS: true
        }),
        channel, chartRef;

    function showEle(elementId) {
        document.getElementById(elementId).style.display = 'flex';
    }

    function hideEle(elementId) {
        document.getElementById(elementId).style.display = 'none';
    }

    function parseFormatNumber(number) {
        return parseFloat(number).toLocaleString();
    }

    function appendNewChart(chartId) {
        $('#render-area').append(`
            <div class='row'>
                <div class='col-md-12'>
                    <div class='chart'>
                        <canvas id='${chartId}' style=''>
                        </canvas>
                    </div>
                </div>
            </div>`
        );
    }

    function ajax(url, method, payload, successCallback) {
        var xhr = new XMLHttpRequest();
        xhr.open(method, url, true);
        xhr.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
        xhr.onreadystatechange = function() {
            if (xhr.readyState != 4 || xhr.status != 200) return;
            successCallback(xhr.responseText);
        };
        xhr.send(JSON.stringify(payload));
    }


    function renderChart(chartID, data, chartRef, chartName) {
        var ctx = document.getElementById(chartID).getContext("2d");
        var options = {
            responsive: true,
            title: {
                display: true,
                text: chartName
            },
            tooltips: {
                mode: 'index',
                intersect: false,
            },
            hover: {
                mode: 'nearest',
                intersect: true
            },
            scales: {
                xAxes: [{
                    display: true,
                    scaleLabel: {
                        display: true,
                        labelString: 'api'
                    },
                    ticks: {
                        autoSkip: true,
                        maxTicksLimit: 20
                    }
                }],
                yAxes: [
                    {
                        id: 'MS',
                        display: true,
                        position: 'left',
                        scaleLabel: {
                            display: true,
                            labelString: 'time(ms)'
                        }
                    },
                    {
                        id: 'TIME',
                        display: true,
                        position: 'right',
                        ticks: {
                            max: 50,
                            min: 0
                        },
                        scaleLabel: {
                            display: true,
                            labelString: 'count(time)'
                        }
                    }

                ]
            }
        };
        window[chartRef] = new Chart(ctx, {
            type: "bar",
            data: data,
            options: options
        });
    }
    ajax("/init", "GET", {}, init);

    function init(response) {
        var respData = JSON.parse(response);
        for (var index in Object.keys(respData)) {
            const key = Object.keys(respData)[index];
            appendNewChart(key);
            const itemData = respData[key];
            const data = getData(itemData);
            renderChart(key, data, `chartRef-${key}`, `${key.toUpperCase()} - ${itemData.from}`);
        }
    }

    function getData(response) {
        const data = {
            labels: [],
            datasets: [
                {
                    yAxisID: 'TIME',
                    label: "Times",
                    borderColor: "#008000",
                    data: [],
                    fill: false,
                    type: 'line'
                },
                {
                    yAxisID: 'MS',
                    label: "Limit (500ms)",
                    borderColor: "#D50000",
                    data: [],
                    fill: false,
                    type: 'line'
                },
                {
                    yAxisID: 'MS',
                    label: "# Time Consumption",
                    backgroundColor: "#3e95cd",
                    data: []
                }
            ]
        };
        const p = response.value;
        for (var key in p) {
            if (p.hasOwnProperty(key)) {
                data.labels.push(key);
                data.datasets[0].data.push(p[key].count);
                data.datasets[1].data.push(500);
                data.datasets[2].data.push(p[key].avg);
            }
        }
        return data;
    }

    channel = pusher.subscribe('api-time');
    channel.bind('new-data', function(data) {
        const key = Object.keys(data)[0],
        charRefKey = `chartRef-${key}`;
        const newData = getData(data[key]);
        window[charRefKey].config.data = newData;
        window[charRefKey].update();
    });
});