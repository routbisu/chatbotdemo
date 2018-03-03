// Get app configuration
const config            = require('../app.config');
const nodeRest          = require('node-rest-client').Client;
const nodeRestClient    = new nodeRest();
const commonServices    = require('./common');
const log               = require('node-file-logger');

const turboAPIBaseURL = config.paymentAPI.BaseURL;

module.exports = {

    /**
     * @param {*} params params sent from dialog flow
     */
    ProcessRequest: function(res, params, contexts) {

        // Default speech.
        let defaultSpeech = 'I am not able to find the information currently. Please try again.';
        let policyNotFound = 'I was not able to find any data for this policy number. Please try again.';
        let otpEmailed = 'Please enter the one time password emailed to you at: ';
        let correctOtp = 'Your OTP has been verified.';
        let wrongOtp = 'The password you entered is incorrect. Please enter again.';

        if(params['policynumber']) {

            let url = turboAPIBaseURL + 'Chatbot/GetCustomerDetails?PolicyNumber=' 
                + params['policynumber'];

            nodeRestClient.get(url, function (data, response) {

                log.Debug(data, 'PaymentAPI', 'Check policy number');

                let validPolicy = false;
                if(data) {
                    if(data.Error == 0) {
                        if(data.Email) {
                            validPolicy = true;
                        }
                    }
                }

                if(validPolicy) {
                    // Send OTP  
                    let otpUrl = turboAPIBaseURL + 'Chatbot/SendOTP';

                    let args = {
                        data: {
                            Name: data.Name,
                            Email: data.Email,
                            PolicyNumber: data.PolicyNumber
                        },
                        headers: { "Content-Type": "application/json" }
                    };

                    nodeRestClient.post(otpUrl, args, function (data, response) {
                        if(data) {
                            log.Debug(data, 'PaymentAPI', 'Send OTP');

                            if(data.Error == 0) {

                                let contextOut = [
                                    {
                                        name: "otp", 
                                        lifespan: 500, 
                                        parameters : 
                                        { 
                                            serverotp: data.EncryptedOTP 
                                        }
                                    }
                                ];

                                let speech = otpEmailed + args.data.Email;
                                commonServices.SendResponse(res, speech, contextOut);
                            
                            } else {

                                let followupEvent = {
                                    name: 'askpolicynumber',
                                    data: {
                                        serverotp: data.EncryptedOTP 
                                    }
                                };

                                commonServices.SendResponse(res, policyNotFound, null, followupEvent);
                            }
                        } else {

                            let followupEvent = {
                                name: 'askpolicynumber',
                                data: {
                                    serverotp: data.EncryptedOTP 
                                }
                            };

                            commonServices.SendResponse(res, policyNotFound, null, followupEvent);
                        }
                    });
                } else {
                    let followupEvent = {
                        name: 'askpolicynumber',
                        data: {
                            serverotp: data.EncryptedOTP 
                        }
                    };

                    commonServices.SendResponse(res, policyNotFound, null, followupEvent);
                }
            });

        } 
        else if(params['userotp']) {
            // Find OTP context
            let otpContext = null;

            for(i = 0; i < contexts.length; i++) {
                if(contexts[i].name == "otp") {
                    otpContext = contexts[i];
                    break;
                }
            }

            if(otpContext.parameters.serverotp.toLowerCase() === params['userotp'].toLowerCase()) {
                //commonServices.SendResponse(res, correctOtp);

                // Get Policy information
                let policyInfo;
                for(i = 0; i < contexts.length; i++) {
                    if(contexts[i].name == "policyinfo") {
                        policyInfo = contexts[i];
                        break;
                    }
                }

                let policyNumber = policyInfo.parameters.policynumber;
                let url = turboAPIBaseURL + 'Chatbot/GetPolicyDetails?PolicyNumber=' + policyNumber;
                nodeRestClient.get(url, function (data, response) {
                    if(data) {
                        log.Debug(data);
                        if(data.Error == 0) {
                            let customerName = false;            
                            if(data.CustomerContactDetails) {
                                customerName = data.CustomerContactDetails.FirstName + ' ' 
                                    + data.CustomerContactDetails.LastName;
                            } 
            
                            let speech;
            
                            if(data.CustomerID) {
                                speech = data.ProductType + ' Policy ' + data.PolicyNumber + ' with Insured name ' 
                                    + customerName + ' is valid till ' + data.PolicyEndDate + ' with total premium $' 
                                    + data.TotalPremium ;
                            } else {
                                speech = policyNotFound;
                            }                       
    
                            commonServices.SendResponse(res, speech);
    
                        } else {
                            commonServices.SendResponse(res, policyNotFound);
                        }
                    } else {
                        commonServices.SendResponse(res, policyNotFound);               
                    }
                });

            } else {
                commonServices.SendResponse(res, wrongOtp);
            }
        }
        else {
            commonServices.SendResponse(res, defaultSpeech);
        }
    },

    ProcessRequestNew: function(res, result) {

        let speech = {
            default: 'I am not able to find the information currently. Please try again.',
            policyNotFound: 'I was not able to find any data for this policy number. Please try again.',
            otpMailed: 'Please enter the one time password emailed to you at: ',
            correctOtp: 'Your OTP has been verified.',
            wrongOtp: 'The password you entered is incorrect. Please enter again.'
        };

        if(result) {
            // Authentication action
            if(result.action == 'authentication') {

            } else if(result.action == 'getpolicydetails') {
                let followupEvent = {
                    name: 'authenticate',
                    data: {
                        policynumber: 'POLICYNUMBER' 
                    }
                };

                commonServices.SendResponse(res, 'Result of policydetails', null, followupEvent);
            } else {
                commonServices.SendResponse(res, speech.default);
            }
        } else {
            commonServices.SendResponse(res, speech.default);
        }
    }

}