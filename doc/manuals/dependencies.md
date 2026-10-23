# Dependencies

The STH component is a **Node.js application** which depends on certain Node.js modules as stated in the
[`package.json`](https://github.com/makeOurCity/fiware-sth-comet/blob/master/package.json) file. Currently, the STH
component supports **Node.js 22** and **Node.js 24**, which are the versions tested by the CI.

Apart from these Node.js modules, the STH component also needs a running MongoDB instance where the raw and aggregated
time series context information is stored for its proper functioning. Since the STH component uses
[MongoDB update operators](https://docs.mongodb.com/v2.6/reference/operator/update/) such as the `$max` and the `$min`
update operators which were introduced in version 2.6, there is a dependency of the STH component with this concrete
version of the MongoDB database. Consequently, a **MongoDB version >= 2.6** is needed to store the raw and aggregated
time series context information managed by the STH component.
