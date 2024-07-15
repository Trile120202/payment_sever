const express = require('express');
const app = express();
const cors = require('cors');
const port = 3003;
const Stripe = require('stripe');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const stripeRouter = require('./routes/stripe');
const bodyParser = require('body-parser');
const Order = require('./models/orders');

dotenv.config();

const stripe = Stripe(process.env.STRIPE_SECRET);
mongoose
  .connect(process.env.MONGO_URL)
  .then(() => console.log('db connected'))
  .catch((err) => console.log(err));

const endpointSecret = 'whsec_WkHz7siBtaOWjdxLjCPoeepvNvxhH6u0';

app.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  (request, response) => {
    const sig = request.headers['stripe-signature'];

    let event;

    try {
      event = stripe.webhooks.constructEvent(request.body, sig, endpointSecret);
    } catch (err) {
      response.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    switch (event.type) {
      case 'payment_intent.succeeded':
        paymentIntentSucceeded = event.data.object;
        break;

      case 'checkout.session.completed':
        const checkoutData = event.data.object;
        stripe.customers
          .retrieve(checkoutData.customer)
          .then(async (customer) => {
            try {
              const data = JSON.parse(customer.metadata.cart);

              const products = data.map((item) => ({
                productId: item.id,
                quantity: item.cartQuantity,
              }));

              const newOrder = new Order({
                userId: customer.metadata.userId,
                customerId: checkoutData.customer,
                products: products,
                subtotal: parseFloat((checkoutData.amount_subtotal / 100).toFixed(2)),
                total: parseFloat((checkoutData.amount_total / 100).toFixed(2)),
                payment_status: checkoutData.payment_status,
              });

              try {
                await newOrder.save();
                console.log('Order processed');
              } catch (err) {
                console.log(err);
              }
            } catch (err) {
              console.log(err);
            }
          })
          .catch((err) => console.log(err.message));
        break;

      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    response.send();
  }
);


app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

app.use('/stripe', stripeRouter);

app.listen(process.env.PORT || port, () =>
  console.log(`App listening on port ${process.env.PORT}!`)
);
